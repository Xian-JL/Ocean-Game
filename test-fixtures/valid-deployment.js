"use strict";

const { DEPLOYABLE_TYPES: TYPES } = require("../server/game/units");

function createValidDeployment() {
  return [
    {
      id: "destroyer-i",
      type: TYPES.DESTROYER_I,
      cells: ["A1", "A2", "A3"],
    },
    {
      id: "destroyer-ii",
      type: TYPES.DESTROYER_II,
      cells: ["B1", "C1", "D1", "E1"],
    },
    {
      id: "submarine",
      type: TYPES.SUBMARINE,
      cells: ["C3", "C4", "D3", "D4"],
    },
    {
      id: "pirate",
      type: TYPES.PIRATE_SHIP,
      cells: ["F1", "F2", "F3"],
    },
    {
      id: "motorboat",
      type: TYPES.MOTORBOAT,
      cells: ["J10"],
    },
    {
      id: "motorboat-2",
      type: TYPES.MOTORBOAT,
      cells: ["L12"],
    },
    {
      id: "nuclear",
      type: TYPES.NUCLEAR_SUBMARINE,
      cells: ["H1", "H2", "I1", "I2"],
    },
    {
      id: "carrier",
      type: TYPES.AIRCRAFT_CARRIER,
      cells: ["G5", "G6", "H5", "H6", "I5", "J5"],
    },
    {
      id: "decoy-1",
      type: TYPES.DECOY_TORPEDO,
      cells: ["A10"],
    },
    {
      id: "decoy-2",
      type: TYPES.DECOY_TORPEDO,
      cells: ["D10"],
    },
    {
      id: "decoy-3",
      type: TYPES.DECOY_TORPEDO,
      cells: ["G10"],
    },
  ];
}

module.exports = {
  createValidDeployment,
};
