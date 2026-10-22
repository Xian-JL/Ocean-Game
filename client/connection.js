  function connectSocket() {
    if (typeof window.io !== "function") {
      setConnectionDisplay("offline", "实时客户端加载失败");
      state.entry.error = "Socket.IO 客户端未能加载，请刷新页面。";
      render();
      return;
    }
    const socket = window.io({
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
      randomizationFactor: 0.4,
      timeout: 10_000,
    });
    state.socket = socket;

    socket.on("system:ready", (message) => {
      state.protocolVersion = message?.protocolVersion ?? null;
      state.serverStage = message?.stage ?? null;
      if (
        Data.RELEASE &&
        (state.protocolVersion !== Data.RELEASE.socketProtocolVersion ||
          state.serverStage !== Data.RELEASE.stage)
      ) {
        showToast(
          `前后端版本不一致：页面 ${Data.RELEASE.stage}/协议 ${Data.RELEASE.socketProtocolVersion}，服务器 ${state.serverStage ?? "未知"}/协议 ${state.protocolVersion ?? "未知"}。请强制刷新页面。`,
          "warning",
          12_000,
        );
      }
    });

    socket.on("room:session", (session) => {
      if(state.training?.active)return;
      if (
        session?.active === true &&
        ROOM_CODE_PATTERN.test(session.roomCode) &&
        typeof session.playerId === "string"
      ) {
        state.session = {
          roomCode: session.roomCode,
          playerId: session.playerId,
        };
        if (typeof session.reconnectToken === "string") {
          saveStoredSession(session);
        }
        updateRoomAddress(session.roomCode);
        state.restoring = false;
      } else if (session?.active === false) {
        clearStoredSession();
        state.session = null;
        state.room = null;
        state.restoring = false;
        state.pendingRequest = null;
        updateRoomAddress(null);
      }
      render();
    });

    socket.on("room:state", acceptRoomState);

    socket.on("room:error", (error) => {
      const message = humanizeSocketError(error);
      showToast(message, "error", 8_000);
      if (
        state.restoring &&
        [
          "INVALID_RECONNECT_CREDENTIAL",
          "RECONNECT_DEADLINE_EXPIRED",
          "ROOM_CLOSED",
          "ROOM_NOT_FOUND",
        ].includes(error.code)
      ) {
        state.restoring = false;
        state.room = null;
        clearStoredSession();
        updateRoomAddress(null);
        state.entry.error = message;
        render();
      }
      if (error.code === "STATE_VERSION_CONFLICT") {
        void emitRequest("room:sync", {}).then((response) => {
          if (response.view) acceptRoomState(response.view);
        }).catch(() => {});
      }
    });

    socket.on("connect", () => {
      if(state.training?.session){state.connected=true;setConnectionPhase("online","训练服务可用","online","训练服务在线");render();return;}
      state.connected = true;
      state.connection.failures = 0;
      const reconnectingWithRoom = Boolean(state.room || readStoredSession());
      setConnectionPhase(
        state.room ? "syncing" : "online",
        reconnectingWithRoom ? "连接已建立，正在恢复并校准对局状态。" : "服务器连接正常。",
        reconnectingWithRoom ? "warning" : "online",
        state.room ? "正在同步" : "服务器在线",
      );
      render();
      socket.timeout(3_000).emit("client:ping", {}, (error, response) => {
        if (error || !response?.ok) {
          setConnectionDisplay("warning", "应答检查延迟");
        }
      });
      const stored = readStoredSession();
      const requestedRoom = new URL(window.location.href)
        .searchParams.get("room")
        ?.trim()
        .toUpperCase();
      const shouldAutoRestore = Boolean(
        stored &&
        (!requestedRoom || requestedRoom === stored.roomCode) &&
        (state.room || requestedRoom),
      );
      if (shouldAutoRestore && !state.restoring && !state.training?.active) {
        state.autoRestoreAttempted = true;
        void restoreSession();
      }
    });

    socket.on("disconnect", (reason) => {
      state.connected = false;
      state.restoring = false;
      setConnectionPhase(
        navigator.onLine ? "reconnecting" : "offline",
        navigator.onLine
          ? `连接已中断，客户端正在自动重连（${reason ?? "原因未知"}）。`
          : "当前设备处于离线状态。恢复网络后客户端会自动重连。",
        "offline",
        "正在重连",
      );
      render();
    });

    socket.on("connect_error", () => {
      if(state.training?.session)return;
      state.connected = false;
      state.connection.failures += 1;
      setConnectionPhase(
        "waking",
        state.connection.failures >= 2
          ? "免费服务器可能正在从休眠中唤醒，请保留页面；客户端会自动重试。"
          : "服务器尚未响应，正在自动重试。",
        "warning",
        "正在唤醒服务器",
      );
      render();
    });
  }
