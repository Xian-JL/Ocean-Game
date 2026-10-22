'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const routes={
 '/':['docs/ui-motion/effects-catalog.html','text/html; charset=utf-8'],
 '/catalog.js':['docs/ui-motion/effects-catalog.js','text/javascript; charset=utf-8'],
 '/motion-runtime.js':['client/motion.js','text/javascript; charset=utf-8'],
 '/css/ocean.css':['public/css/ocean.css','text/css; charset=utf-8']
};
const server=http.createServer((req,res)=>{
 const route=routes[new URL(req.url,'http://local').pathname];
 if(!route){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',route[1]);res.setHeader('Cache-Control','no-store');
 res.end(fs.readFileSync(path.join(root,route[0])));
});
if(require.main===module)server.listen(3007,'127.0.0.1',()=>console.log('[Ocean] 动效示例目录 http://127.0.0.1:3007'));
module.exports={server};
