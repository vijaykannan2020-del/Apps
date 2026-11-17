// Checks case status on the phone itself, the same way a person would: opens the official
// USCIS Case Status Online page (egov.uscis.gov) in an in-app browser, types the receipt number,
// presses "Check Status" and reads the result shown. The receipt number goes only to USCIS.
// Starts out of sight; if USCIS shows a check ("Verify you are human") the page slides up so the
// person can complete it, then it closes again on its own.
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View, ActivityIndicator } from 'react-native';
import { T } from './ui';
import { useTheme } from '../theme';

export type WebCase = { status: string; detail: string; form?: string; date?: string };
type Job = { receipt: string; resolve: (r: WebCase) => void; reject: (e: Error) => void };

const URL = 'https://egov.uscis.gov/';
const queue: Job[] = [];
let wake: (() => void) | null = null;
let mounted = false;

export const phoneLookupAvailable = () => Platform.OS !== 'web' && mounted;

export function lookupOnPhone(receipt: string): Promise<WebCase> {
  return new Promise((resolve, reject) => {
    queue.push({ receipt, resolve, reject });
    wake?.();
  });
}

// Runs inside the USCIS page. Fills the form, submits, then reports the result card.
const script = (receipt: string) => `
(function () {
  var R = ${JSON.stringify(receipt)}, sent = false, started = Date.now(), last = '';
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function visible(el) { return el && el.offsetParent !== null; }
  function setVal(input, v) {
    var proto = Object.getPrototypeOf(input);
    var setter = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    setter.set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function findInput() {
    return document.querySelector('input[name="receipt_number"], #receipt_number, input[id*="receipt" i], input[name*="receipt" i], input[aria-label*="receipt" i]')
      || Array.prototype.find.call(document.querySelectorAll('input[type="text"], input:not([type])'), visible);
  }
  function findButton(form) {
    var btns = Array.prototype.slice.call((form || document).querySelectorAll('button, input[type="submit"]'));
    return btns.find(function (b) { return /check status/i.test(b.innerText || b.value || ''); }) || btns.find(function (b) { return b.type === 'submit'; });
  }
  function result() {
    var text = document.body ? document.body.innerText : '';
    if (/receipt number entered is invalid|not a valid receipt|validation error|could not find/i.test(text) && sent) {
      var m = text.match(/[^\\n]*(invalid|not valid|validation error|could not find)[^\\n]*/i);
      return { error: m ? m[0].trim() : 'USCIS did not recognise this receipt number.' };
    }
    // The result paragraph mentions the receipt number; its heading is the status.
    var nodes = document.querySelectorAll('p, div, span');
    var best = null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], t = (n.innerText || '').trim();
      if (t.length > 60 && t.length < 1500 && t.toUpperCase().indexOf(R) >= 0 && !n.querySelector('input')) {
        if (!best || t.length < best.innerText.trim().length) best = n;
      }
    }
    if (!best) return null;
    var status = '';
    var box = best;
    for (var up = 0; up < 6 && box && !status; up++) {
      var h = box.querySelector('h1, h2, h3, h4, strong, b');
      if (h && h !== best && !/case status online|check case status|receipt number/i.test(h.innerText)) status = h.innerText.trim();
      box = box.parentElement;
    }
    if (!status) {
      var prev = best.previousElementSibling;
      while (prev && !status) { var s = (prev.innerText || '').trim(); if (s && s.length < 120) status = s; prev = prev.previousElementSibling; }
    }
    return { status: status, detail: best.innerText.trim() };
  }
  function tick() {
    var title = document.title || '';
    var challenge = /just a moment|attention required|verify you are human/i.test(title + ' ' + (document.body ? document.body.innerText.slice(0, 400) : ''));
    if (challenge) { if (last !== 'challenge') { last = 'challenge'; post({ type: 'challenge' }); } return setTimeout(tick, 700); }
    var r = sent ? result() : null;
    if (r && (r.error || (r.status && r.detail))) return post(Object.assign({ type: r.error ? 'error' : 'done' }, r));
    if (!sent) {
      var input = findInput();
      if (input) {
        input.focus(); setVal(input, R);
        var btn = findButton(input.form);
        setTimeout(function () {
          if (btn) btn.click(); else if (input.form) input.form.requestSubmit ? input.form.requestSubmit() : input.form.submit();
          sent = true;
        }, 300);
      }
    }
    if (Date.now() - started > 45000) return post({ type: 'error', error: 'USCIS took too long to answer. Try again.' });
    setTimeout(tick, 700);
  }
  tick();
})();
true;`;

function parse(raw: { status: string; detail: string }): WebCase {
  const detail = raw.detail.replace(/\s+/g, ' ').trim();
  const form = detail.match(/Form\s+([A-Z]-?\d{2,4}[A-Z]?)/)?.[1]?.replace(/^([A-Z])(\d)/, '$1-$2');
  const d = detail.match(/^On\s+([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1];
  const date = d ? new Date(d + ' 12:00').toISOString().slice(0, 10) : undefined;
  return { status: raw.status.replace(/\s+/g, ' ').trim(), detail, form, date };
}

export function UscisLookupHost() {
  const t = useTheme();
  const [job, setJob] = useState<Job | null>(null);
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(0);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    mounted = true;
    wake = () => setJob((cur) => cur || queue.shift() || null);
    wake();
    return () => { mounted = false; wake = null; };
  }, []);

  const finish = (fn: () => void) => {
    clearTimeout(timer.current);
    fn();
    setShow(false);
    setJob(queue.shift() || null);
    setKey((k) => k + 1);
  };

  useEffect(() => {
    if (!job) return;
    // If nothing comes back quickly, show the page so the person can see what USCIS wants.
    timer.current = setTimeout(() => setShow(true), 12000);
    return () => clearTimeout(timer.current);
  }, [job]);

  const onMessage = (e: any) => {
    if (!job) return;
    let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'challenge') setShow(true);
    else if (m.type === 'done') finish(() => job.resolve(parse(m)));
    else if (m.type === 'error') finish(() => job.reject(new Error(m.error)));
  };

  const cancel = () => { if (job) finish(() => job.reject(new Error('Check cancelled.'))); };

  if (!job || Platform.OS === 'web') return null;
  const { WebView } = require('react-native-webview');
  const web = (
    <WebView
      key={key}
      source={{ uri: URL }}
      injectedJavaScript={script(job.receipt)}
      onMessage={onMessage}
      onError={() => finish(() => job.reject(new Error('Could not open the USCIS website. Check your connection.')))}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      javaScriptEnabled
      domStorageEnabled
      style={{ flex: 1, backgroundColor: t.bg }}
    />
  );

  return show ? (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
          <ActivityIndicator color={t.sub} />
          <View style={{ flex: 1 }}>
            <T v="h3">Checking with USCIS</T>
            <T v="small">{job.receipt} · complete any check on the page; this closes by itself.</T>
          </View>
          <Pressable onPress={cancel} hitSlop={10}><T v="body" style={{ color: t.accent }}>Cancel</T></Pressable>
        </View>
        {web}
      </View>
    </Modal>
  ) : (
    <View pointerEvents="none" style={{ position: 'absolute', width: 390, height: 844, left: -2000, top: 0, opacity: 0 }}>{web}</View>
  );
}
