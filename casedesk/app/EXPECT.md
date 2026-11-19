# What to expect — how the estimate is built (v2.4)

Goal: on every case, show a typical decision window, approval and RFE context, and anonymous "Cases like mine" timelines. It is an estimate from public numbers. It is **not a prediction of the person's case and not legal advice**. Every number shows its quarter or date and its source.

## Order of evidence
1. **Official USCIS statistics** (downloaded by the server weekly, never from the phone):
   - *Number of Service-wide Forms by Quarter, Form Status, and Processing Time*: `quarterly_all_forms_fyYYYY_qN[_v1].xlsx`. Gives receipts, approvals, denials, pending and the **median** processing time per form per quarter. The latest release seen is FY2026 Q3 (Apr–Jun 2026): `https://www.uscis.gov/sites/default/files/document/data/quarterly_all_forms_fy2026_q3_v1.xlsx`.
   - *Nonimmigrant Worker Petitions by Case Status and Request for Evidence*: `i129_quarterly_request_for_evidence_fyYYYY_qN[_v1].xlsx`. Gives I-129 approval rate, RFE rate and approval-after-RFE, by class (H-1B, L-1A, L-1B, O, and others).
   - *H-1B Employer Data Hub*: national initial and continuing approval rates, summed from the files the server already downloads.
   - *USCIS processing times* ("8 in 10 cases done within"): `data/content/processing.json` on the server, or the built-in snapshot (Oct 19, 2026).
2. **Community timelines**, second. They are hidden until **at least 10 similar cases are decided**. The narrowest group with enough cases is used: same office and month → ±1 month → any office ±1 month → same office, last year → any office, last year. The card says which group it used.

**Window** = from the USCIS median for the form to the published 8-in-10 time for the class, counted from the receipt date. If only the 8-in-10 time is known, the card says "8 in 10 within X" and does not make up a lower bound. The two measures differ:
- The median is service-wide, all categories of the form together, premium and regular.
- The 8-in-10 time covers the last 6 months, for one category.

The card shows them as a range on purpose, not as one number.

## Receipt prefixes and offices
- `EAC` Vermont, `WAC` California, `LIN` Nebraska, `SRC` Texas, `YSC` Potomac, `NBC`/`MSC` National Benefits Center, `IOE` filed online (ELIS).
- The prefix shows **where the case was received (intake), not who decides it**. Service centers share work: USCIS publishes I-129, I-140, I-539 and I-765 times once, for *Service Center Operations*, not per center. So the per-office "range" for these forms is the SCOPS range, and the card says so. `IOE` cases can be assigned to any center.
- N-400 and most I-485s are decided by the local **field office**. That office is set by the person's address, not by the receipt prefix. NBC/MSC is pre-processing only. The card says the time depends on the field office.
- Community cohorts still use the 3-letter prefix, because that is the only office code the app knows without asking for an address.

## Premium processing (I-907)
- The clock runs in **business days** (DHS fee rule, effective April 2024). We skip weekends and federal holidays (observed dates).
- 15 days: I-129, and I-140 EB-1A, EB-1B, EB-2 and EB-3.
- 45 days: I-140 E13 (multinational manager) and EB-2 NIW.
- 30 days: I-539 for F, J and M, and I-765 for (c)(3) OPT and STEM OPT.
- No premium: I-485, I-130, N-400.
- The clock starts when USCIS receives the **I-907**. If premium was added after filing, that is later than the case receipt date, and the card tells the person to count from the I-907 receipt. USCIS meets the clock by approving, denying, or issuing an RFE or NOID. An RFE stops the clock, and a new full clock starts when USCIS receives the response.
- With premium on, the decision-by date replaces the regular window. Premium and regular community cases are never mixed.

## RFE effect
- An RFE pauses the case. The response is due within 84 days plus 3 for mailing, and then USCIS needs time to review it. So the decision comes later than the window, and the card says this when the case is in RFE.
- I-129 RFE data gives the approval-after-RFE share per class. It is computed as *approved with RFE ÷ completions with RFE*. We do not use the file's own "%" column: public analyses report that it is printed as a share of all decisions.
- The RFE file counts initial decisions only, and a petition with several RFEs counts once.
- Community rows store only the current/final outcome, so "now in RFE" is a snapshot. It does not show how many approved cases had an RFE.

## Privacy (Cases like mine)
- Each shared entry holds only: form, 3-letter office code, received date, decided date, outcome, premium yes/no and visa class (new, optional, from a fixed list). The server stores a hash of a random id made on the phone, so the entry can be updated and deleted.
- Never shared: receipt number, name or device id.
- Sharing is opt-in per case, and the "What exactly is shared?" sheet shows the exact line. Turning it off deletes the entry. Stored under the old app's key `cd.community.v1`, so earlier opt-ins carry over.

## Offline
- The card shows the last server answer with its date. If there is none, it shows the built-in summary (official FY2026 Q3 numbers plus I-129 class rates for FY2026 Q1–Q3, checked Nov 18, 2026).

## Known limits
- The quarterly report has no per-class I-129 median. That is why the class-level timing comes from processing times.
- The built-in I-129 class rates were checked against a public summary of the USCIS file, not against the file itself (uscis.gov could not be reached from the build machine). The server replaces them with the real file on its first weekly run.
- The parser finds columns by their header words. If USCIS changes the layout, the ingest step fails loudly and keeps the previous `form-stats.json`.
