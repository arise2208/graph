import React, { useRef, useState, useEffect } from "react";

export default function GraphCanvas() {
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [input, setInput] = useState(`0\n1\n2\n3\n4\n0 1\n1 2\n2 3\n3 0\n1 4\n2 2`);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingNode, setEditingNode] = useState(null);
  const [labelInput, setLabelInput] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAlgorithm, setCurrentAlgorithm] = useState("");
  const [animationStep, setAnimationStep] = useState(0);
  const [algorithmState, setAlgorithmState] = useState({});
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [isDirected, setIsDirected] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [pathsBetweenNodes, setPathsBetweenNodes] = useState([]);
  const [foundCycles, setFoundCycles] = useState([]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });

  const width = 1000, height = 600;
  const dpr = window.devicePixelRatio || 1;

  // --- Graph Parsing ---
  function parseInput() {
    const lines = input.split("\n").map(l => l.trim()).filter(Boolean);
    const nodeIds = [];
    const edgeList = [];
    for (let line of lines) {
      if (/^\d+$/.test(line)) nodeIds.push(Number(line));
      else if (/^\d+\s+\d+(\s+\d+)?$/.test(line)) {
        const parts = line.split(/\s+/).map(Number);
        const [a, b, weight = 1] = parts;
        edgeList.push({ from: a, to: b, weight, isSelfLoop: a === b });
      }
    }
    const radius = Math.min(width, height) * 0.32;
    const centerX = width / 2;
    const centerY = height / 2;
    setNodes(nodeIds.map((id, i) => {
      const angle = (2 * Math.PI * i) / nodeIds.length;
      return {
        id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        label: "",
        color: "#2563eb",
        visited: false,
        distance: Infinity,
        parent: null
      };
    }));
    setEdges(edgeList.map(e => ({ ...e, highlighted: false, color: "#6b7280" })));
    resetAlgorithmState();
    setFoundCycles([]);
    setPathsBetweenNodes([]);
  }

  function resetAlgorithmState() {
    setIsAnimating(false);
    setCurrentAlgorithm("");
    setAnimationStep(0);
    setAlgorithmState({});
    setSelectedNodes([]);
    setNodes(prev => prev.map(n => ({
      ...n,
      color: "#2563eb",
      visited: false,
      distance: Infinity,
      parent: null
    })));
    setEdges(prev => prev.map(e => ({ ...e, highlighted: false, color: "#6b7280" })));
    setFoundCycles([]);
    setPathsBetweenNodes([]);
  }

  // --- Mouse and Node Helpers ---
  function getMousePos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top)
    };
  }

  function getNodeAtPoint(x, y) {
    return nodes.find(node => {
      const dx = x - node.x;
      const dy = y - node.y;
      return Math.sqrt(dx * dx + dy * dy) <= 25;
    });
  }

  // --- Mouse Events ---
  function handleMouseDown(e) {
    const pos = getMousePos(e);
    const node = getNodeAtPoint(pos.x, pos.y);

    if (node) {
      setIsDragging(true);
      setDragNodeId(node.id);
      setDragOffset({
        x: pos.x - node.x,
        y: pos.y - node.y
      });

      if (!isAnimating && currentAlgorithm) {
        if (["findpaths"].includes(currentAlgorithm)) {
          if (selectedNodes.length < 2) {
            setSelectedNodes(prev => {
              if (prev.includes(node.id)) return prev;
              return [...prev, node.id];
            });
          }
        }
        if (["dijkstra", "bfs", "dfs"].includes(currentAlgorithm)) {
          setSelectedNodes([node.id]);
        }
      }
    }
  }

  function handleMouseMove(e) {
    if (!isDragging || dragNodeId === null) return;
    const pos = getMousePos(e);
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === dragNodeId
          ? { ...node, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y }
          : node
      )
    );
  }

  function handleMouseUp() {
    setIsDragging(false);
    setDragNodeId(null);
    setDragOffset({ x: 0, y: 0 });
  }

  // --- Context Menu for Right Click ---
  function handleContextMenu(e) {
    e.preventDefault();
    const pos = getMousePos(e);
    const node = getNodeAtPoint(pos.x, pos.y);
    if (node) {
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id
      });
    } else {
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    }
  }

  useEffect(() => {
    function closeMenu(e) {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
      }
    }
    if (contextMenu.visible) {
      document.addEventListener("click", closeMenu);
      document.addEventListener("contextmenu", closeMenu);
      return () => {
        document.removeEventListener("click", closeMenu);
        document.removeEventListener("contextmenu", closeMenu);
      };
    }
  }, [contextMenu.visible]);

  function editNodeLabel(nodeId) {
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setEditingNode(nodeId);
      setLabelInput(node.label || "");
    }
  }

  function hangTreeFromRootRightClick(nodeId) {
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    hangTreeFromRoot(nodeId);
  }

  // --- Tree Layout ---
  function hangTreeFromRoot(rootOverride = null) {
    const rootId = rootOverride != null ? rootOverride : (selectedNodes.length > 0 ? selectedNodes[0] : null);
    if (rootId == null) return;
    
    const childMap = new Map(nodes.map(n => [n.id, []]));
    
    edges.forEach(e => {
      if (isDirected) {
        if (!e.isSelfLoop) childMap.get(e.from).push(e.to);
      } else {
        if (!e.isSelfLoop) {
          childMap.get(e.from).push(e.to);
          childMap.get(e.to).push(e.from);
        }
      }
    });
    
    const levels = [];
    const visited = new Set();
    const queue = [[rootId, 0, null]];
    
    while (queue.length) {
      const [node, level, parent] = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      
      if (!levels[level]) levels[level] = [];
      levels[level].push(node);
      
      for (const child of childMap.get(node)) {
        if (!visited.has(child)) queue.push([child, level + 1, node]);
      }
    }
    
    const verticalGap = 80;
    const nodeGap = 70;
    const baseY = 60;
    const canvasW = width;
    const newPositions = {};
    
    for (let lvl = 0; lvl < levels.length; lvl++) {
      const count = levels[lvl].length;
      const totalWidth = (count - 1) * nodeGap;
      for (let i = 0; i < count; i++) {
        const x = canvasW / 2 - totalWidth / 2 + i * nodeGap;
        const y = baseY + lvl * verticalGap;
        newPositions[levels[lvl][i]] = { x, y };
      }
    }
    
    setNodes(prev =>
      prev.map(n =>
        newPositions[n.id]
          ? { ...n, x: newPositions[n.id].x, y: newPositions[n.id].y }
          : n
      )
    );
  }

  // --- All Paths Between Two Nodes ---
  async function findAllPathsBetweenNodes() {
    setIsAnimating(true);
    setPathsBetweenNodes([]);
    if (selectedNodes.length !== 2) {
      setIsAnimating(false);
      return;
    }
    const [start, end] = selectedNodes;
    const allPaths = [];
    const path = [];
    
    function getNeighbors(id) {
      if (isDirected) {
        return edges.filter(e => e.from === id && !e.isSelfLoop).map(e => e.to);
      } else {
        return edges.filter(e => (e.from === id || e.to === id) && !e.isSelfLoop)
          .map(e => e.from === id ? e.to : e.from);
      }
    }
    
    function dfs(current, visited) {
      visited.add(current);
      path.push(current);
      if (current === end) {
        allPaths.push([...path]);
      } else {
        for (const neighbor of getNeighbors(current)) {
          if (!visited.has(neighbor)) {
            dfs(neighbor, visited);
          }
        }
      }
      path.pop();
      visited.delete(current);
    }
    
    dfs(start, new Set());
    
    const pathColors = [
      "#ef4444", "#3b82f6", "#f59e0b", "#06b6d4", "#22c55e", "#ec4899", 
      "#8b5cf6", "#84cc16", "#eab308", "#f43f5e", "#a21caf", "#0ea5e9"
    ];
    
    setEdges(prev => prev.map(e => ({ ...e, color: "#6b7280" })));
    setNodes(prev => prev.map(n => ({ ...n, color: "#2563eb" })));
    
    for (let i = 0; i < allPaths.length; i++) {
      const path = allPaths[i];
      const color = pathColors[i % pathColors.length];
      for (let j = 0; j < path.length - 1; j++) {
        highlightEdge(path[j], path[j + 1], color);
      }
      for (let nodeId of path) {
        setNodeColor(nodeId, color);
      }
      await sleep(Math.max(150, speed / 3));
    }
    
    setPathsBetweenNodes([...allPaths]);
    setIsAnimating(false);
  }

  // --- Cycle Detection ---
  async function detectCycles() {
    setIsAnimating(true);
    const allCycles = [];
    const colors = ["#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
    
    const selfLoops = edges.filter(e => e.isSelfLoop);
    for (let selfLoop of selfLoops) {
      allCycles.push([selfLoop.from]);
      const color = colors[allCycles.length - 1] || "#ef4444";
      highlightEdge(selfLoop.from, selfLoop.to, color);
      setNodeColor(selfLoop.from, color);
      await sleep(speed);
    }
    
    if (!isDirected) {
      const visited = new Set();
      async function dfsUndirected(nodeId, parent, path) {
        visited.add(nodeId);
        setNodeColor(nodeId, "#fbbf24");
        await sleep(speed / 2);
        
        const neighbors = edges.filter(e => {
          if (e.isSelfLoop) return false;
          if (!(e.from === nodeId || e.to === nodeId)) return false;
          const neighbor = e.from === nodeId ? e.to : e.from;
          return neighbor !== parent;
        });
        
        for (let edge of neighbors) {
          const neighbor = edge.from === nodeId ? edge.to : edge.from;
          if (path.includes(neighbor)) {
            const cycleStart = path.indexOf(neighbor);
            const cycle = [...path.slice(cycleStart), nodeId];
            const cycleSorted = [...cycle].sort((a, b) => a - b);
            if (!allCycles.some(cy => cy.length === cycle.length && cy.sort((a,b)=>a-b).every((v,i)=>v===cycleSorted[i]))) {
              allCycles.push(cycle);
              const color = colors[allCycles.length - 1] || "#ef4444";
              for (let i = 0; i < cycle.length; i++) {
                const from = cycle[i];
                const to = cycle[(i + 1) % cycle.length];
                highlightEdge(from, to, color);
                setNodeColor(from, color);
              }
              await sleep(speed);
            }
          } else if (!visited.has(neighbor)) {
            await dfsUndirected(neighbor, nodeId, [...path, nodeId]);
          }
        }
      }
      
      for (let node of nodes) {
        if (!visited.has(node.id)) {
          await dfsUndirected(node.id, -1, []);
        }
      }
    } else {
      const globalVisited = new Set();
      const stack = [];
      const onStack = new Set();
      
      async function dfsDirected(nodeId, path) {
        stack.push(nodeId);
        onStack.add(nodeId);
        globalVisited.add(nodeId);
        setNodeColor(nodeId, "#fbbf24");
        await sleep(speed / 3);
        
        const neighbors = edges.filter(e => e.from === nodeId && !e.isSelfLoop);
        for (let edge of neighbors) {
          const neighbor = edge.to;
          if (!globalVisited.has(neighbor)) {
            await dfsDirected(neighbor, [...path, nodeId]);
          } else if (onStack.has(neighbor)) {
            const cycleStart = stack.indexOf(neighbor);
            const cycle = stack.slice(cycleStart);
            const cycleSorted = [...cycle].sort((a, b) => a - b);
            if (!allCycles.some(cy => cy.length === cycle.length && cy.sort((a,b)=>a-b).every((v,i)=>v===cycleSorted[i]))) {
              allCycles.push([...cycle, neighbor]);
              const color = colors[allCycles.length - 1] || "#ef4444";
              for (let i = 0; i < cycle.length; i++) {
                const from = cycle[i];
                const to = cycle[(i + 1) % cycle.length];
                highlightEdge(from, to, color);
                setNodeColor(from, color);
              }
              setNodeColor(neighbor, color);
              await sleep(speed);
            }
          }
        }
        stack.pop();
        onStack.delete(nodeId);
        setNodeColor(nodeId, "#10b981");
      }
      
      for (let node of nodes) {
        if (!globalVisited.has(node.id)) {
          await dfsDirected(node.id, []);
        }
      }
    }
    
    setFoundCycles(allCycles.map(c => [...c]));
    if (allCycles.length === 0) {
      nodes.forEach(node => setNodeColor(node.id, "#22c55e"));
      await sleep(1000);
      nodes.forEach(node => setNodeColor(node.id, "#2563eb"));
    } else {
      setAlgorithmState({ cycleCount: allCycles.length, cycles: allCycles });
    }
    setIsAnimating(false);
  }

  // --- Helpers for Coloring ---
  function setNodeColor(nodeId, color) {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, color } : n));
  }

  function highlightEdge(from, to, color) {
    setEdges(prev => prev.map(e =>
      (e.from === from && e.to === to) || (!isDirected && e.from === to && e.to === from)
        ? { ...e, color, highlighted: true } : e
    ));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runAlgorithm(algorithm) {
    if (isAnimating) return;
    resetAlgorithmState();
    setCurrentAlgorithm(algorithm);
    switch (algorithm) {
      case "cycles":
        await detectCycles();
        break;
      case "findpaths":
        if (selectedNodes.length === 2) {
          await findAllPathsBetweenNodes();
        }
        break;
    }
  }

  function saveLabel() {
    if (editingNode !== null) {
      setNodes(prevNodes =>
        prevNodes.map(node =>
          node.id === editingNode
            ? { ...node, label: labelInput }
            : node
        )
      );
      setEditingNode(null);
      setLabelInput("");
    }
  }

  function cancelEdit() {
    setEditingNode(null);
    setLabelInput("");
  }

  // --- Enhanced Drawing Function ---
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw edges with improved rendering
    edges.forEach(e => {
      const a = nodes.find(n => n.id === e.from);
      const b = nodes.find(n => n.id === e.to);
      if (a && b) {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.highlighted ? 3 : 2;
        ctx.lineCap = "round";

        if (e.isSelfLoop) {
          // Clean self-loop rendering
          const loopRadius = 25;
          const loopCenterX = a.x;
          const loopCenterY = a.y - 40;
          
          ctx.beginPath();
          ctx.arc(loopCenterX, loopCenterY, loopRadius, 0, 2 * Math.PI);
          ctx.stroke();
          
          if (isDirected) {
            const arrowX = loopCenterX + loopRadius * 0.7;
            const arrowY = loopCenterY + loopRadius * 0.7;
            const arrowLength = 10;
            const arrowAngle = Math.PI / 6;
            const tangentAngle = Math.PI / 4 + Math.PI / 2;
            
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(
              arrowX - arrowLength * Math.cos(tangentAngle - arrowAngle),
              arrowY - arrowLength * Math.sin(tangentAngle - arrowAngle)
            );
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(
              arrowX - arrowLength * Math.cos(tangentAngle + arrowAngle),
              arrowY - arrowLength * Math.sin(tangentAngle + arrowAngle)
            );
            ctx.stroke();
          }
          
          if (e.weight !== 1) {
            ctx.fillStyle = "#374151";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(e.weight, loopCenterX, loopCenterY - loopRadius - 8);
          }
        } else {
          // Check if there's a reverse edge for curved rendering
          const hasReverseEdge = edges.some(re => 
            re.from === e.to && re.to === e.from && re !== e
          );
          
          if (hasReverseEdge && isDirected) {
            // Draw curved edge
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const curvature = 0.15;
            
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const offsetX = -dy / distance * curvature * distance;
            const offsetY = dx / distance * curvature * distance;
            
            const controlX = midX + offsetX;
            const controlY = midY + offsetY;
            
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(controlX, controlY, b.x, b.y);
            ctx.stroke();
            
            if (isDirected) {
              const t = 0.8;
              const arrowX = (1-t)*(1-t)*a.x + 2*(1-t)*t*controlX + t*t*b.x;
              const arrowY = (1-t)*(1-t)*a.y + 2*(1-t)*t*controlY + t*t*b.y;
              
              const tangentX = 2*(1-t)*(controlX - a.x) + 2*t*(b.x - controlX);
              const tangentY = 2*(1-t)*(controlY - a.y) + 2*t*(b.y - controlY);
              const angle = Math.atan2(tangentY, tangentX);
              
              const arrowLength = 12;
              const arrowAngle = Math.PI / 6;
              
              ctx.beginPath();
              ctx.moveTo(arrowX, arrowY);
              ctx.lineTo(
                arrowX - arrowLength * Math.cos(angle - arrowAngle),
                arrowY - arrowLength * Math.sin(angle - arrowAngle)
              );
              ctx.moveTo(arrowX, arrowY);
              ctx.lineTo(
                arrowX - arrowLength * Math.cos(angle + arrowAngle),
                arrowY - arrowLength * Math.sin(angle + arrowAngle)
              );
              ctx.stroke();
            }
            
            if (e.weight !== 1) {
              const t = 0.5;
              const weightX = (1-t)*(1-t)*a.x + 2*(1-t)*t*controlX + t*t*b.x;
              const weightY = (1-t)*(1-t)*a.y + 2*(1-t)*t*controlY + t*t*b.y;
              
              ctx.fillStyle = "#374151";
              ctx.font = "11px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(e.weight, weightX, weightY - 5);
            }
          } else {
            // Draw straight edge
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            if (isDirected) {
              const angle = Math.atan2(b.y - a.y, b.x - a.x);
              const arrowLength = 12;
              const arrowAngle = Math.PI / 6;
              const endX = b.x - 27 * Math.cos(angle);
              const endY = b.y - 27 * Math.sin(angle);
              
              ctx.beginPath();
              ctx.moveTo(endX, endY);
              ctx.lineTo(
                endX - arrowLength * Math.cos(angle - arrowAngle),
                endY - arrowLength * Math.sin(angle - arrowAngle)
              );
              ctx.moveTo(endX, endY);
              ctx.lineTo(
                endX - arrowLength * Math.cos(angle + arrowAngle),
                endY - arrowLength * Math.sin(angle + arrowAngle)
              );
              ctx.stroke();
            }

            if (e.weight !== 1) {
              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              ctx.fillStyle = "#374151";
              ctx.font = "11px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(e.weight, midX, midY - 5);
            }
          }
        }
      }
    });

    // Draw nodes with clean styling
    nodes.forEach(n => {
      const isSelected = selectedNodes.includes(n.id);

      // Node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, 25, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? "#fbbf24" : "#ffffff";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Node ID
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.id, n.x, n.y);

      // Node label
      if (n.label) {
        ctx.fillStyle = "#374151";
        ctx.font = "12px sans-serif";
        ctx.fillText(n.label, n.x, n.y + 40);
      }
    });

    ctx.restore();
  }

  useEffect(draw, [nodes, edges, dpr, dragNodeId, currentAlgorithm, selectedNodes]);
  useEffect(() => { parseInput(); }, []);

  // --- UI ---
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <h1 className="text-xl font-semibold text-gray-900">Graph Editor</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Compact Controls */}
        <div className="bg-white rounded-lg border border-gray-200 mb-4">
          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Graph Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Graph</label>
                <textarea
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={6}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={isAnimating}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                    onClick={parseInput}
                    disabled={isAnimating}
                  >
                    Generate
                  </button>
                  <button
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                    onClick={resetAlgorithmState}
                    disabled={isAnimating}
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Algorithms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Algorithms</label>
                <div className="space-y-2">
                  <button
                    className={`w-full px-3 py-2 rounded text-sm ${
                      currentAlgorithm === "cycles" 
                        ? "bg-red-600 text-white" 
                        : "bg-red-100 hover:bg-red-200 text-red-700"
                    }`}
                    onClick={() => runAlgorithm("cycles")}
                    disabled={isAnimating}
                  >
                    Detect Cycles
                  </button>
                  <button
                    className={`w-full px-3 py-2 rounded text-sm ${
                      currentAlgorithm === "findpaths" 
                        ? "bg-teal-600 text-white" 
                        : "bg-teal-100 hover:bg-teal-200 text-teal-700"
                    }`}
                    onClick={() => {
                      resetAlgorithmState();
                      setCurrentAlgorithm("findpaths");
                    }}
                    disabled={isAnimating}
                  >
                    Find Paths
                  </button>
                  {currentAlgorithm === "findpaths" && selectedNodes.length === 2 && (
                    <button
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded text-sm"
                      disabled={isAnimating}
                      onClick={() => runAlgorithm("findpaths")}
                    >
                      Show: {selectedNodes[0]} → {selectedNodes[1]}
                    </button>
                  )}
                </div>
              </div>

              {/* Settings */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Settings</label>
                <div className="space-y-3">
                  <label className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={isDirected}
                      onChange={e => setIsDirected(e.target.checked)}
                      disabled={isAnimating}
                      className="mr-2"
                    />
                    Directed
                  </label>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Speed: {speed}ms</label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      value={speed}
                      onChange={e => setSpeed(Number(e.target.value))}
                      disabled={isAnimating}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Layout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
                <button
                  className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
                  onClick={() => hangTreeFromRoot()}
                  disabled={isAnimating || selectedNodes.length === 0}
                >
                  Tree Layout
                </button>
                {selectedNodes.length > 0 && (
                  <div className="mt-2 text-xs text-blue-600">
                    Selected: {selectedNodes.join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex justify-center">
          <div className="border border-gray-300 rounded-lg bg-white relative">
            <canvas
              ref={canvasRef}
              width={width * dpr}
              height={height * dpr}
              style={{ 
                width: `${width}px`, 
                height: `${height}px`, 
                display: "block",
                cursor: isAnimating ? 'wait' : (isDragging ? 'grabbing' : 'grab')
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onContextMenu={handleContextMenu}
              className="select-none"
            />
            
            {/* Context Menu */}
            {contextMenu.visible && (
              <div
                style={{
                  position: "fixed",
                  left: contextMenu.x,
                  top: contextMenu.y,
                  zIndex: 1000,
                  background: "white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  minWidth: 150
                }}
              >
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                  onClick={() => editNodeLabel(contextMenu.nodeId)}
                >
                  Edit Label
                </button>
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-t border-gray-200"
                  onClick={() => hangTreeFromRootRightClick(contextMenu.nodeId)}
                >
                  Tree from Here
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Edit Label Modal */}
        {editingNode !== null && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-80">
              <h3 className="font-medium mb-4">Edit Label for Node {editingNode}</h3>
              <input
                type="text"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="Enter label"
                className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => {
                  if (e.key === 'Enter') saveLabel();
                  if (e.key === 'Escape') cancelEdit();
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={saveLabel}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {algorithmState.cycleCount > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-medium text-red-800 mb-2">
              Found {algorithmState.cycleCount} cycle{algorithmState.cycleCount > 1 ? 's' : ''}
            </h3>
            <div className="text-sm text-red-700 space-y-1">
              {foundCycles.map((cycle, idx) => (
                <div key={idx}>{cycle.join(" → ")}</div>
              ))}
            </div>
          </div>
        )}
        
        {pathsBetweenNodes.length > 0 && (
          <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
            <h3 className="font-medium text-teal-800 mb-2">
              Found {pathsBetweenNodes.length} path{pathsBetweenNodes.length > 1 ? 's' : ''} between {selectedNodes[0]} and {selectedNodes[1]}
            </h3>
            <div className="text-sm text-teal-700 space-y-1">
              {pathsBetweenNodes.map((path, idx) => (
                <div key={idx}>{path.join(" → ")}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}