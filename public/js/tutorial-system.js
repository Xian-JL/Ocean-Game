"use strict";

(function initializeTutorialSystem(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.OceanTutorial = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createTutorialSystem() {
  const BOARD_SIZE = 12;
  const ROWS = "ABCDEFGHIJKL";
  const TUTORIAL_VERSION = "1.0";

  const LESSONS = Object.freeze([
    Object.freeze({
      id: "deployment",
      number: "01",
      title: "秘密部署",
      subtitle: "放置、旋转与合法占格",
      summary: "部署内容只对自己可见；线形舰艇必须水平或垂直连续，所有对象不能重叠。",
    }),
    Object.freeze({
      id: "damage",
      number: "02",
      title: "攻击与受击格",
      subtitle: "范围、反馈与一次伤害",
      summary: "一个单位格至多受到一次伤害；不同武器仍可能再次选择它，但不能重复扣血。",
    }),
    Object.freeze({
      id: "intelligence",
      number: "03",
      title: "侦察与标记",
      subtitle: "从布尔情报形成判断",
      summary: "雷达只报告区域内是否存在布局；探测弹只报告水下信号，私人标记不会发送给服务器。",
    }),
    Object.freeze({
      id: "secrecy",
      number: "04",
      title: "保密武器",
      subtitle: "攻击方与防守方看到不同消息",
      summary: "潜射导弹、核弹和震爆弹都不向行动方报告是否成功，防守方仍能看到己方实际变化。",
    }),
    Object.freeze({
      id: "command",
      number: "05",
      title: "指挥考核",
      subtitle: "特殊伤害、三人同步与终局",
      summary: "通过四道情境题后完成训练，进入正式人机对局。",
    }),
  ]);

  const QUIZ = Object.freeze([
    Object.freeze({
      id: "pirate",
      question: "海盗船成功命中一格敌方作战单位时，哪项结算正确？",
      options: Object.freeze([
        Object.freeze({ id: "a", text: "目标 −2；海盗船 −1；海盗船受伤使己方航母 −0.5" }),
        Object.freeze({ id: "b", text: "目标 −1；海盗船未受伤" }),
        Object.freeze({ id: "c", text: "无论命中与否，海盗船都会自损" }),
      ]),
      correct: "a",
      explanation: "自损只在成功命中时发生；海盗船每次实际受伤都会联动己方航空母舰损失 0.5。",
    }),
    Object.freeze({
      id: "motorboat",
      question: "摩托艇攻击到水下作战单位时会怎样？",
      options: Object.freeze([
        Object.freeze({ id: "a", text: "目标 −1，摩托艇沉没" }),
        Object.freeze({ id: "b", text: "判定未命中，目标和摩托艇均不受伤" }),
        Object.freeze({ id: "c", text: "只摧毁目标，不影响摩托艇" }),
      ]),
      correct: "b",
      explanation: "摩托艇只能撞到水面单位或诱饵；水下作战单位对它表现为空海域。",
    }),
    Object.freeze({
      id: "three-player",
      question: "三人局中一次驱逐舰冲撞同时命中两名敌人，行动方自损如何计算？",
      options: Object.freeze([
        Object.freeze({ id: "a", text: "每命中一名敌人自损一次" }),
        Object.freeze({ id: "b", text: "行动资源与行动方自损都只结算一次" }),
        Object.freeze({ id: "c", text: "随机选择一名敌人结算" }),
      ]),
      correct: "b",
      explanation: "两名防守方分别承受效果，但行动方只提交一次行动，资源和自损不会翻倍。",
    }),
    Object.freeze({
      id: "final-salvo",
      question: "所有常规攻击手段耗尽后，下一步是什么？",
      options: Object.freeze([
        Object.freeze({ id: "a", text: "立即按当前航母生命值结束" }),
        Object.freeze({ id: "b", text: "双方依次秘密选择并手动引爆剩余有效诱饵鱼雷" }),
        Object.freeze({ id: "c", text: "恢复全部弹药继续战斗" }),
      ]),
      correct: "b",
      explanation: "终局齐射完成后才比较仍存活的航空母舰，并按最终生命值确定胜负。",
    }),
  ]);

  function clone(value) {
    return structuredClone(value);
  }

  function createSession(completedLessonIds = []) {
    const completed = [...new Set(completedLessonIds)]
      .filter((id) => LESSONS.some((lesson) => lesson.id === id));
    return {
      version: TUTORIAL_VERSION,
      lessonIndex: 0,
      completedLessonIds: completed,
      step: 0,
      message: "点击 B2，将驱逐舰Ⅰ横向部署到 B2～B4。",
      messageKind: "info",
      deployment: {
        anchor: null,
        orientation: "horizontal",
        cells: [],
      },
      damage: {
        selectedAction: "destroyer",
        targetHp: 3,
        ownDestroyerHp: 3,
        hitCells: [],
        missCells: [],
        nuclearCells: [],
      },
      intelligence: {
        selectedTool: "radar",
        radarCells: [],
        detectionCells: [],
        markers: {},
      },
      secrecy: {
        selectedWeapon: "missile",
        missileCells: [],
        nuclearCells: [],
        shockCells: [],
        attackerMessage: "尚未发射",
        defenderMessage: "尚未受到攻击",
      },
      quiz: {
        index: 0,
        correctCount: 0,
        lastAnswer: null,
      },
      finished: completed.length === LESSONS.length,
    };
  }

  function currentLesson(session) {
    return LESSONS[session.lessonIndex] ?? LESSONS[0];
  }

  function parseCoordinate(coordinate) {
    const match = /^([A-L])(1[0-2]|[1-9])$/.exec(String(coordinate ?? ""));
    if (!match) return null;
    return { row: ROWS.indexOf(match[1]), column: Number(match[2]) - 1 };
  }

  function formatCoordinate(row, column) {
    if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) {
      return null;
    }
    return `${ROWS[row]}${column + 1}`;
  }

  function lineCells(anchor, orientation, length = 3) {
    const point = parseCoordinate(anchor);
    if (!point) return [];
    return Array.from({ length }, (_value, index) => formatCoordinate(
      point.row + (orientation === "vertical" ? index : 0),
      point.column + (orientation === "horizontal" ? index : 0),
    )).filter(Boolean);
  }

  function squareFromStart(coordinate, size) {
    const point = parseCoordinate(coordinate);
    if (!point) return [];
    return Array.from({ length: size }, (_row, rowOffset) =>
      Array.from({ length: size }, (_column, columnOffset) =>
        formatCoordinate(point.row + rowOffset, point.column + columnOffset),
      ),
    ).flat().filter(Boolean);
  }

  function squareFromCenter(coordinate, size) {
    const point = parseCoordinate(coordinate);
    if (!point) return [];
    const offset = Math.floor(size / 2);
    return Array.from({ length: size }, (_row, rowOffset) =>
      Array.from({ length: size }, (_column, columnOffset) =>
        formatCoordinate(
          point.row - offset + rowOffset,
          point.column - offset + columnOffset,
        ),
      ),
    ).flat().filter(Boolean);
  }

  function markCompleted(session, lessonId) {
    if (!session.completedLessonIds.includes(lessonId)) {
      session.completedLessonIds.push(lessonId);
    }
    session.finished = session.completedLessonIds.length === LESSONS.length;
  }

  function resetLessonState(session, lessonId) {
    session.step = 0;
    session.messageKind = "info";
    if (lessonId === "deployment") {
      session.deployment = { anchor: null, orientation: "horizontal", cells: [] };
      session.message = "点击 B2，将驱逐舰Ⅰ横向部署到 B2～B4。";
    } else if (lessonId === "damage") {
      session.damage = {
        selectedAction: "destroyer",
        targetHp: 3,
        ownDestroyerHp: 3,
        hitCells: [],
        missCells: [],
        nuclearCells: [],
      };
      session.message = "使用驱逐舰Ⅰ攻击 D6。训练目标生命值为 3。";
    } else if (lessonId === "intelligence") {
      session.intelligence = {
        selectedTool: "radar",
        radarCells: [],
        detectionCells: [],
        markers: {},
      };
      session.message = "首次回合必须使用雷达。点击 C3，扫描 C3～F6。";
    } else if (lessonId === "secrecy") {
      session.secrecy = {
        selectedWeapon: "missile",
        missileCells: [],
        nuclearCells: [],
        shockCells: [],
        attackerMessage: "尚未发射",
        defenderMessage: "尚未受到攻击",
      };
      session.message = "选择潜射导弹后点击 G7。注意两侧消息差异。";
    } else {
      session.quiz = { index: 0, correctCount: 0, lastAnswer: null };
      session.message = "依次完成四道情境题。答错不会扣除进度。";
    }
  }

  function navigate(session, index) {
    const next = clone(session);
    next.lessonIndex = Math.max(0, Math.min(LESSONS.length - 1, index));
    resetLessonState(next, currentLesson(next).id);
    return next;
  }

  function handleDeployment(session, action) {
    if (action.type === "tutorial-cell" && session.step === 0) {
      if (action.coordinate !== "B2") {
        session.message = "本步骤请从 B2 开始，避免越界并建立明确锚点。";
        session.messageKind = "warning";
        return;
      }
      session.deployment.anchor = "B2";
      session.deployment.cells = lineCells("B2", "horizontal");
      session.step = 1;
      session.message = "部署合法。现在点击“旋转”，观察舰艇以 B2 为锚点变为纵向。";
      session.messageKind = "success";
      return;
    }
    if (action.type === "tutorial-rotate" && session.step === 1) {
      session.deployment.orientation = "vertical";
      session.deployment.cells = lineCells("B2", "vertical");
      session.step = 2;
      markCompleted(session, "deployment");
      session.message = "完成：线形舰艇只能水平或垂直连续；正式部署还必须避免重叠。";
      session.messageKind = "success";
    }
  }

  function handleDamage(session, action) {
    if (action.type === "tutorial-select" && action.value === "nuclear" && session.step === 2) {
      session.damage.selectedAction = "nuclear";
      session.step = 3;
      session.message = "核弹可以选择 D6，但该单位格已经受过伤害，不会再次扣血。点击 D6。";
      session.messageKind = "info";
      return;
    }
    if (action.type !== "tutorial-cell") return;
    if (session.step === 0 && action.coordinate === "D6") {
      session.damage.hitCells = ["D6"];
      session.damage.targetHp = 2;
      session.damage.ownDestroyerHp = 2.5;
      session.step = 1;
      session.message = "命中：目标 −1，驱逐舰Ⅰ自损 0.5。再次使用驱逐舰点击 D6。";
      session.messageKind = "success";
      return;
    }
    if (session.step === 1 && action.coordinate === "D6") {
      session.step = 2;
      session.message = "驱逐舰的这个坐标已使用，不能重复冲撞。现在选择“核弹”。";
      session.messageKind = "warning";
      return;
    }
    if (session.step === 3 && action.coordinate === "D6") {
      session.damage.nuclearCells = ["D6"];
      session.step = 4;
      markCompleted(session, "damage");
      session.message = "完成：核弹已投放，但目标仍为 2 HP；同一单位格最多受到一次伤害，且核弹不报告命中。";
      session.messageKind = "success";
      return;
    }
    session.message = "请按照当前任务点击高亮坐标。";
    session.messageKind = "warning";
  }

  function handleIntelligence(session, action) {
    if (action.type === "tutorial-select") {
      if (session.step === 1 && action.value === "underwater_yes") {
        session.intelligence.selectedTool = "underwater_yes";
        session.step = 2;
        session.message = "选择成功。点击 E5，把推断记录为“水下有目标”。";
        session.messageKind = "info";
      } else if (session.step === 3 && action.value === "detection") {
        session.intelligence.selectedTool = "detection";
        session.step = 4;
        session.message = "点击 H8，以它为中心探测完整 3×3 区域。";
        session.messageKind = "info";
      }
      return;
    }
    if (action.type !== "tutorial-cell") return;
    if (session.step === 0 && action.coordinate === "C3") {
      session.intelligence.radarCells = squareFromStart("C3", 4);
      session.step = 1;
      session.message = "雷达报告：该 4×4 区域存在敌方布局，但不说明位置和层级。请选择“水下有”。";
      session.messageKind = "success";
      return;
    }
    if (session.step === 2 && action.coordinate === "E5") {
      session.intelligence.markers.E5 = "underwater_yes";
      session.step = 3;
      session.message = "私人标记只保存在本机，不影响服务器结算。现在选择“探测弹”。";
      session.messageKind = "success";
      return;
    }
    if (session.step === 4 && action.coordinate === "H8") {
      session.intelligence.detectionCells = squareFromCenter("H8", 3);
      session.step = 5;
      markCompleted(session, "intelligence");
      session.message = "完成：发现水下信号，但信号可能来自潜艇、核潜艇或有效诱饵鱼雷。";
      session.messageKind = "success";
      return;
    }
    session.message = "请点击任务指定的高亮坐标。";
    session.messageKind = "warning";
  }

  function handleSecrecy(session, action) {
    if (action.type === "tutorial-select") {
      const expected = session.step === 1 ? "nuclear" : session.step === 2 ? "shock" : "missile";
      if (action.value === expected) {
        session.secrecy.selectedWeapon = action.value;
        session.message = action.value === "nuclear"
          ? "点击 H8 投放核弹。"
          : action.value === "shock"
            ? "点击 F6 施加震爆区域。"
            : "点击 G7 发射潜射导弹。";
        session.messageKind = "info";
      }
      return;
    }
    if (action.type !== "tutorial-cell") return;
    if (session.step === 0 && action.coordinate === "G7" && session.secrecy.selectedWeapon === "missile") {
      session.secrecy.missileCells = ["G7"];
      session.secrecy.attackerMessage = "潜射导弹已向 G7 发射；结果未知";
      session.secrecy.defenderMessage = "潜水艇被命中，生命值 2 → 1";
      session.step = 1;
      session.message = "攻击方只知道已发射；防守方看到己方实际伤害。选择“核弹”。";
      session.messageKind = "success";
      return;
    }
    if (session.step === 1 && action.coordinate === "H8" && session.secrecy.selectedWeapon === "nuclear") {
      session.secrecy.nuclearCells = ["H8"];
      session.secrecy.attackerMessage = "核弹已向 H8 投放；命中情况保密";
      session.secrecy.defenderMessage = "航空母舰被命中，生命值 6 → 4";
      session.step = 2;
      session.message = "核弹命中航母实际造成 2 点伤害，但行动方不知道。选择“震爆弹”。";
      session.messageKind = "success";
      return;
    }
    if (session.step === 2 && action.coordinate === "F6" && session.secrecy.selectedWeapon === "shock") {
      session.secrecy.shockCells = squareFromCenter("F6", 5);
      session.secrecy.attackerMessage = "震爆弹已作用于 F6 周围 5×5；是否生效保密";
      session.secrecy.defenderMessage = "水下作战单位将在自己的下个正常回合瘫痪";
      session.step = 3;
      markCompleted(session, "secrecy");
      session.message = "完成：三种保密武器都不向行动方返回命中或生效结论。";
      session.messageKind = "success";
      return;
    }
    session.message = "先选择当前要求的武器，再点击指定坐标。";
    session.messageKind = "warning";
  }

  function handleQuiz(session, action) {
    if (action.type !== "tutorial-answer") return;
    const question = QUIZ[session.quiz.index];
    if (!question) return;
    session.quiz.lastAnswer = action.value;
    if (action.value !== question.correct) {
      session.message = `再想一下：${question.explanation}`;
      session.messageKind = "warning";
      return;
    }
    session.quiz.correctCount += 1;
    session.quiz.index += 1;
    session.quiz.lastAnswer = null;
    session.step = session.quiz.index;
    if (session.quiz.index >= QUIZ.length) {
      markCompleted(session, "command");
      session.finished = true;
      session.message = "全部训练完成。你可以从新手机器人开始，也可以直接挑战更高难度。";
      session.messageKind = "success";
    } else {
      session.message = `回答正确：${question.explanation}`;
      session.messageKind = "success";
    }
  }

  function reduce(session, action) {
    if (!session || session.version !== TUTORIAL_VERSION) {
      return createSession();
    }
    if (action.type === "tutorial-go-lesson") {
      return navigate(session, Number(action.index));
    }
    if (action.type === "tutorial-next-lesson") {
      return navigate(session, session.lessonIndex + 1);
    }
    if (action.type === "tutorial-previous-lesson") {
      return navigate(session, session.lessonIndex - 1);
    }
    if (action.type === "tutorial-reset-lesson") {
      return navigate(session, session.lessonIndex);
    }
    const next = clone(session);
    const lessonId = currentLesson(next).id;
    if (lessonId === "deployment") handleDeployment(next, action);
    if (lessonId === "damage") handleDamage(next, action);
    if (lessonId === "intelligence") handleIntelligence(next, action);
    if (lessonId === "secrecy") handleSecrecy(next, action);
    if (lessonId === "command") handleQuiz(next, action);
    return next;
  }

  function lessonIsComplete(session, lessonId) {
    return session.completedLessonIds.includes(lessonId);
  }

  function progress(session) {
    return {
      completed: session.completedLessonIds.length,
      total: LESSONS.length,
      percent: Math.round(session.completedLessonIds.length / LESSONS.length * 100),
    };
  }

  return Object.freeze({
    BOARD_SIZE,
    LESSONS,
    QUIZ,
    ROWS,
    TUTORIAL_VERSION,
    createSession,
    currentLesson,
    lessonIsComplete,
    progress,
    reduce,
  });
});
