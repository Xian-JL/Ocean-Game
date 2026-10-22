# 训练会话与HTTP接口

## 隔离与生命周期

训练通过/api/training请求，使用独立TrainingService.sessions Map，合成cadet席位与TRNAAA房间标识不会注册到正式room-service，也不通过正式Socket路由执行。令牌为32字节随机值，session ID与generation为UUID。服务内存最多100会话，默认30分钟不活动过期，访问时续期；每60秒清理。重启服务后会话丢失，客户端提示重来，本机已体验进度保留。

每IP固定窗口限240请求/分钟；响应Cache-Control:no-store。缺失、互换或过期令牌统一拒绝。此令牌仅授权当前合成练习，不是正式对局恢复凭证。

## 接口

| 方法与路径 | 请求/返回 |
| --- | --- |
| GET /api/training/catalog | 场景版本、规则版本和元数据；没有真实局面 |
| POST /api/training/sessions | scenarioId以及可选mapSize、players、action、targetKind、sourceState；返回token及首个过滤视图 |
| GET /api/training/sessions/:id | X-Training-Token；当前角色安全view、任务、roles、generation |
| POST /api/training/sessions/:id/commands | X-Training-Token；event、payload、operationId |
| GET /api/training/sessions/:id/reveal | 先明确reveal控制；返回当前合成局面的教学解析 |
| DELETE /api/training/sessions/:id | 主动销毁本会话 |

响应包为ok/data或ok:false/error；过期401、其他业务拒绝400、限流429。POST命令必须携带payload.trainingGeneration；除room:sync外必须携带整数expectedVersion>=1。reset可在同generation内取消未知在途操作，因此不要求旧snapshot版本仍相等；旧generation仍拒绝。

## 命令与幂等

| event | 行为 |
| --- | --- |
| room:sync | 同步当前安全状态，处理未知应答，不重复结算 |
| deployment:submit / ready / cancel-ready | 正式部署、准备与取消准备 |
| match:roll-die | 正式骰子逻辑，指定教学场景可受控重投 |
| action:submit | payload.intent，正式beginPlayerAction/completePlayerAction |
| final-salvo:submit | 己方decoyId秘密锁定，由正式齐射规则处理 |
| match:surrender | 正式投降 |
| rematch:request / cancel | 正式再来一局申请/撤回 |
| training:control | 训练环境控制，不加入正式协议 |

operationId为1～100字符稳定编号，最多保留128条结果/错误。同编号同语义返回缓存，不再消耗；改语义复用编号拒绝。版本/generation等传输字段不作为动作语义。客户端接收应答还比较原session/generation，过期结果不覆盖新场景。

## 控制与教学

reset重建检查点并换generation；undo恢复最多16个步骤快照并换generation；role只允许当前合成席位，切换即关闭解析、取消普通效果。reveal/conceal主动开关合成解析；replay仅重播已有安全效果，不调用动作结算。

script推进合成席位；clock-before/clock、run-clock控制虚拟时钟；disconnect/resume、foreground/sync、expire是明确受控模拟。部署180秒、行动90秒、重连120秒阈值来自原规则；默认暂停，继续后定时同步，退出清理。模拟断线不制造真实网络中断或影响正式房间。

markers只验证当前内存标记及删除；join-seat、leave-other、validate-entry等控制服务于额外房间阶段教学。客户端提交的trainingEvidence只用于教学任务达成判断，不授予玩法权限或改写正式规则。教官响应只读取合成本例，不能请求任意正式房间或客户端自带完整状态。
