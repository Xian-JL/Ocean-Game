"use strict";
// Optional local-only component reference. Never mounted by the game server.
const express=require("express");
const path=require("node:path");
const app=express(), root=path.resolve(__dirname,"..");
app.use("/css",express.static(path.join(root,"public/css")));
app.use(express.static(path.join(root,"docs/ui-redesign/design")));
app.get("/",(_req,res)=>res.redirect("/components.html"));
app.listen(3003,"127.0.0.1",()=>console.log("[Ocean design] http://127.0.0.1:3003/components.html"));
