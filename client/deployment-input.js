  function pushDeploymentHistory() {
    state.deployment.history.push(clone(state.deployment.placements));
    if (state.deployment.history.length > 50) {
      state.deployment.history.shift();
    }
  }

  function setPlacement(nextPlacement) {
    recordTrainingLocal({action:"placement-changed",unitId:nextPlacement.id});
    const placements = state.deployment.placements.filter(
      (placement) => placement.id !== nextPlacement.id,
    );
    placements.push({
      id: nextPlacement.id,
      type: nextPlacement.type,
      cells: Data.sortCoordinates(nextPlacement.cells),
    });
    state.deployment.placements = placements;
    state.deployment.dirty =
      placementDigest(placements) !== state.deployment.serverDigest;
  }

  function candidateIsFree(id, cells) {
    return cells.every(
      (coordinate) =>
        Data.parseCoordinate(coordinate) && !occupantAt(coordinate, id),
    );
  }

  function handleDeploymentCell(coordinate) {
    const room = state.room;
    if (getOwnSeat(room)?.ready || room.deploymentsLocked) {
      return;
    }
    const selectedId = state.deployment.selectedId;
    const definition = Data.getUnitDefinitionById(selectedId);
    if (!definition) {
      const occupied = occupantAt(coordinate);
      if (occupied) {
        state.deployment.selectedId = occupied.id;
        render();
      }
      return;
    }
    const existing = placementById(selectedId);

    if (definition.shape === "connected") {
      const cells = [...(existing?.cells ?? [])];
      if (cells.length >= definition.cellCount) {
        if (cells.includes(coordinate)) {
          return;
        }
        const points = cells.map(Data.parseCoordinate);
        const minRow = Math.min(...points.map((point) => point.row));
        const minColumn = Math.min(...points.map((point) => point.column));
        const anchor = Data.parseCoordinate(coordinate);
        const moved = points
          .map((point) =>
            Data.formatCoordinate(
              anchor.row + point.row - minRow,
              anchor.column + point.column - minColumn,
            ),
          )
          .filter(Boolean);
        if (moved.length !== cells.length || !candidateIsFree(selectedId, moved)) {
          showToast("航空母舰移动后会越界或重叠，请选择其他左上锚点。", "warning");
          return;
        }
        pushDeploymentHistory();
        setPlacement({ id: selectedId, type: definition.type, cells: moved });
        Sound?.playEffect?.("move");
        render();
        return;
      }
      const lastCell = cells.at(-1);
      if (cells.includes(coordinate)) {
        if (coordinate !== lastCell) {
          showToast("航空母舰编辑时只能撤销最后选择的一格。", "warning");
          return;
        }
        pushDeploymentHistory();
        const nextCells = cells.slice(0, -1);
        if (nextCells.length === 0) {
          state.deployment.placements = state.deployment.placements.filter(
            (placement) => placement.id !== selectedId,
          );
        } else {
          setPlacement({ id: selectedId, type: definition.type, cells: nextCells });
        }
        state.deployment.dirty = true;
        Sound?.playEffect?.("remove");
        render();
        return;
      }
      if (occupantAt(coordinate, selectedId)) {
        recordTrainingLocal({action:"deployment-rejected",code:"CELL_OVERLAP"});
        showToast("该格已由其他部署对象占用。", "warning");
        return;
      }
      if (
        cells.length > 0 &&
        !cells.some((cell) => Data.fourNeighbors(cell).includes(coordinate))
      ) {
        recordTrainingLocal({action:"deployment-rejected",code:"INVALID_SHAPE"});
        showToast("航空母舰的下一格必须与已选格四向相邻。", "warning");
        return;
      }
      pushDeploymentHistory();
      setPlacement({
        id: selectedId,
        type: definition.type,
        cells: [...cells, coordinate],
      });
      Sound?.playEffect?.("place");
      render();
      return;
    }

    const orientation =
      state.deployment.orientations[selectedId] ?? "horizontal";
    const candidate = Data.createAnchoredCells(
      definition,
      coordinate,
      orientation,
    );
    if (
      candidate.length !== definition.cellCount ||
      !candidateIsFree(selectedId, candidate)
    ) {
      recordTrainingLocal({action:"deployment-rejected",code:candidate.length!==definition.cellCount?"OUT_OF_BOUNDS":"CELL_OVERLAP"});
      showToast("该位置会越界或与其他对象重叠，请选择新的起点。", "warning");
      return;
    }
    pushDeploymentHistory();
    setPlacement({ id: selectedId, type: definition.type, cells: candidate });
    Sound?.playEffect?.("place");
    render();
  }

  function rotateSelectedPlacement() {
    const id = state.deployment.selectedId;
    const definition = Data.getUnitDefinitionById(id);
    if (!definition) return;
    const existing = placementById(id);
    if (!existing) {
      if (definition.shape === "line") {
        state.deployment.orientations[id] =
          state.deployment.orientations[id] === "vertical"
            ? "horizontal"
            : "vertical";
        Sound?.playEffect?.("rotate");
        render();
      } else {
        showToast("该对象无需预先旋转。", "info");
      }
      return;
    }
    if (definition.shape === "single" || definition.shape === "square") {
      showToast("该对象旋转后形状不变。", "info");
      return;
    }
    const points = existing.cells.map(Data.parseCoordinate);
    const minRow = Math.min(...points.map((point) => point.row));
    const minColumn = Math.min(...points.map((point) => point.column));
    let rotated;
    if (definition.shape === "line") {
      const nextOrientation =
        Data.placementOrientation(existing.cells) === "horizontal"
          ? "vertical"
          : "horizontal";
      rotated = Data.createAnchoredCells(
        definition,
        Data.formatCoordinate(minRow, minColumn),
        nextOrientation,
      );
    } else {
      const maxRow = Math.max(...points.map((point) => point.row));
      rotated = points
        .map((point) =>
          Data.formatCoordinate(
            minRow + point.column - minColumn,
            minColumn + maxRow - point.row,
          ),
        )
        .filter(Boolean);
    }
    if (
      rotated.length !== definition.cellCount ||
      !candidateIsFree(id, rotated) ||
      !Data.shapeIsValid(definition, rotated)
    ) {
      recordTrainingLocal({action:"deployment-rejected",code:rotated.length!==definition.cellCount?"OUT_OF_BOUNDS":"CELL_OVERLAP"});
      showToast("旋转后会越界或重叠，已保留原位置。", "warning");
      return;
    }
    if (definition.shape === "line") {
      state.deployment.orientations[id] =
        Data.placementOrientation(rotated);
    }
    pushDeploymentHistory();
    setPlacement({ id, type: definition.type, cells: rotated });
    Sound?.playEffect?.("rotate");
    render();
  }

  function moveDraggedPlacement(id, fromCoordinate, toCoordinate) {
    const existing = placementById(id);
    if (!existing) return;
    const from = Data.parseCoordinate(fromCoordinate);
    const to = Data.parseCoordinate(toCoordinate);
    if (!from || !to) return;
    const moved = existing.cells
      .map((coordinate) => {
        const point = Data.parseCoordinate(coordinate);
        return Data.formatCoordinate(
          point.row + to.row - from.row,
          point.column + to.column - from.column,
        );
      })
      .filter(Boolean);
    if (
      moved.length !== existing.cells.length ||
      !candidateIsFree(id, moved)
    ) {
      showToast("拖动后会越界或重叠，已恢复原位置。", "warning");
      return;
    }
    pushDeploymentHistory();
    setPlacement({ id, type: existing.type, cells: moved });
    state.deployment.selectedId = id;
    Sound?.playEffect?.("move");
    render();
  }
