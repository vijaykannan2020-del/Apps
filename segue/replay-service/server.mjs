// Optional Node 22+ adapter for an existing server; same Worker implementation.
import http from 'node:http';
import worker from './worker.mjs';
const port=Number(process.env.PORT||8787);
http.createServer(async(req,res)=>{
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const request=new Request(`http://localhost:${port}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,process.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Replay service failed.'}));}
}).listen(port,'127.0.0.1',()=>console.log(`Segue replay service listening on 127.0.0.1:${port}`));
