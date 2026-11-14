/* Safe playback report: no URLs, titles, tokens, headers or account identifiers. */
function playbackReport(){
 const video=$('#video'),channel=channels.find(c=>c.id===current);
 const addon=channel&&/mediafusion/i.test(channel.desc)?'MediaFusion':channel&&/comet/i.test(channel.desc)?'Comet':channel&&/cncverse/i.test(channel.desc)?'CNCVerse':channel?'Other source':'No stream selected';
 const ready=['No media metadata','Metadata received','Some video data received','Enough data to start','Enough data to play'];
 const network=['No source','Idle','Loading','No supported source'];
 const code=video.error?.code||window.sidelineMediaError||0;
 const names={1:'Playback aborted',2:'Network fetch failed',3:'Video/audio decode failed',4:'Source or format rejected'};
 return ['Sideline Version 9','Add-on: '+addon,'Cloud service reported in result: '+(channel?.cloudProviderHint||'Not identified (configuration cannot be inferred)'),'Format: '+(channel?.mediaFormat||'Automatic / unknown'),'Custom headers supplied: '+(channel?.requiresHeaders?'Yes; direct playback does not forward them':'None reported'),'Video ready state: '+(ready[video.readyState]||'Not started'),'Video network state: '+(network[video.networkState]||'Not started'),'Media error: '+(names[code]||'None reported'),'This report excludes private URLs, access tokens and account details.'].join('\n');
}
window.updatePlaybackReport=()=>{$('#playbackReport').textContent=playbackReport()};
$('#playbackDetails').ontoggle=window.updatePlaybackReport;
$('#refreshPlaybackReport').onclick=window.updatePlaybackReport;
$('#copyPlaybackReport').onclick=async()=>{window.updatePlaybackReport();try{await navigator.clipboard.writeText(playbackReport());$('#reportCopyStatus').textContent='Safe report copied.'}catch{$('#reportCopyStatus').textContent='Copy unavailable. Take a screenshot of these details.'}};
['playing','waiting','error','loadedmetadata','emptied'].forEach(name=>$('#video').addEventListener(name,window.updatePlaybackReport));
