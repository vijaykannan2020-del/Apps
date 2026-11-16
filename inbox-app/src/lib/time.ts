export function fmtWhen(ts: number) {
  const d = new Date(ts), now = new Date(), tm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'today ' + tm;
  const t = new Date(now); t.setDate(t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return 'tomorrow ' + tm;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + tm;
}
export function quickTimes(): [string, number][] {
  const now = new Date();
  const t8 = new Date(now); t8.setHours(20, 0, 0, 0); if (t8 <= now) t8.setDate(t8.getDate() + 1);
  const m9 = new Date(now); m9.setDate(m9.getDate() + 1); m9.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7)); nextWeek.setHours(9, 0, 0, 0);
  return [
    ['In 1 hour', Date.now() + 3600e3],
    ['In 3 hours', Date.now() + 3 * 3600e3],
    [(t8.getDate() === now.getDate() ? 'Tonight' : 'Tomorrow') + ' at 8 PM', +t8],
    ['Tomorrow at 9 AM', +m9],
    ['Monday at 9 AM', +nextWeek],
  ];
}
export const EMOJI_ALL = ('😀😃😄😁😆😅😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👻💀☠️👽🤖🎃😺😸😹😻😼😽🙀😿😾'
  + '👍👎👊✊🤛🤜🤞✌️🤟🤘👌🤌🤏👈👉👆👇☝️✋🤚🖐🖖👋🤙💪🙏🤝👏🙌👐🤲'
  + '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💯💢💥💫💦💨🔥✨⭐🌟🎉🎊🎁🎂🍰☕🍵🍺🍻🥂🍕🍔🍟🌮🍿⚽🏏🏆🎯🎮🎵🎶📷📱💻💡📌✅❌❓❗💤').match(/\p{Extended_Pictographic}(️)?/gu) || [];
