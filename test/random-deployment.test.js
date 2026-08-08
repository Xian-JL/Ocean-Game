"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateDeployment } = require("../server/game/deployment");
const {
  generateRandomDeployment,
} = require("../server/game/random-deployment");

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("服务器随机部署连续生成多套完整合法舰队", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const deployment = generateRandomDeployment(createSeededRandom(seed));
    const result = validateDeployment(deployment);

    assert.equal(result.valid, true, `seed=${seed}`);
    assert.equal(deployment.length, 11);
  }
});

test("不同随机种子会产生不同部署，而不会固定使用测试模板", () => {
  const variants = new Set(
    Array.from({ length: 12 }, (_value, index) =>
      JSON.stringify(generateRandomDeployment(createSeededRandom(index + 10))),
    ),
  );

  assert.ok(variants.size >= 10);
});

test("随机部署拒绝越出规定区间的随机值", () => {
  assert.throws(
    () => generateRandomDeployment(() => 1),
    (error) => error.code === "INVALID_RANDOM_VALUE",
  );
});
