const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname,'public')));

const rooms = {};
function cleanRoom(id){
  const r=rooms[id]; if(!r) return;
  r.players=r.players.filter(p=>p.socketId && io.sockets.sockets.get(p.socketId));
  if(r.players.length===0) delete rooms[id];
}
function roomState(id){
  const r=rooms[id]; if(!r) return null;
  return {id, players:r.players.map(p=>({name:p.name,score:p.score,index:p.index})), turn:r.turn, balls:r.balls, status:r.status, winner:r.winner};
}
function defaultBalls(){return [
 {x:.42,y:.73,vx:0,vy:0,c:'white'},
 {x:.35,y:.30,vx:0,vy:0,c:'yellow'},
 {x:.66,y:.34,vx:0,vy:0,c:'red'}
]}

io.on('connection', socket=>{
  socket.on('createRoom', ({name})=>{
    let id; do{id=Math.random().toString(36).slice(2,7).toUpperCase()}while(rooms[id]);
    rooms[id]={players:[{socketId:socket.id,name:name||'용호',score:0,index:0}],turn:0,balls:defaultBalls(),status:'waiting',winner:null};
    socket.join(id); socket.data.room=id; socket.data.index=0;
    socket.emit('roomCreated',{room:id,index:0}); io.to(id).emit('state',roomState(id));
  });
  socket.on('joinRoom', ({room,name})=>{
    room=(room||'').toUpperCase().trim(); cleanRoom(room);
    const r=rooms[room];
    if(!r) return socket.emit('errorMsg','방을 찾을 수 없습니다.');
    if(r.players.length>=2) return socket.emit('errorMsg','이미 2명이 참가 중입니다.');
    const index=1;
    r.players.push({socketId:socket.id,name:name||'도전자',score:0,index}); r.status='playing';
    socket.join(room); socket.data.room=room; socket.data.index=index;
    socket.emit('joined',{room,index}); io.to(room).emit('state',roomState(room));
  });
  socket.on('shot', ({room,balls})=>{
    const r=rooms[room]; if(!r) return;
    if(socket.data.index!==r.turn) return;
    r.balls=balls; socket.to(room).emit('remoteShot',{balls,by:r.turn});
  });
  socket.on('shotEnd', ({room,balls,success})=>{
    const r=rooms[room]; if(!r) return;
    if(socket.data.index!==r.turn) return;
    r.balls=balls;
    if(success) r.players[r.turn].score++;
    else r.turn=1-r.turn;
    if(r.players[r.turn] && r.players[r.turn].score>=5){r.winner=r.turn;r.status='finished';}
    io.to(room).emit('state',roomState(room));
  });
  socket.on('resetMatch', ({room})=>{
    const r=rooms[room]; if(!r) return;
    r.players.forEach(p=>p.score=0); r.turn=0; r.balls=defaultBalls(); r.status=r.players.length===2?'playing':'waiting'; r.winner=null;
    io.to(room).emit('state',roomState(room));
  });
  socket.on('disconnect',()=>{
    const room=socket.data.room; if(!room||!rooms[room]) return;
    const r=rooms[room]; r.players=r.players.filter(p=>p.socketId!==socket.id); r.status='waiting'; r.turn=0; r.winner=null;
    io.to(room).emit('state',roomState(room)); if(r.players.length===0) delete rooms[room];
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('YHF billiards running on '+PORT));
