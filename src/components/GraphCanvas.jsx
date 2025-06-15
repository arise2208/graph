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
  const [showControls, setShowControls] = useState(true);

  const width = 1000, height = 650;
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
        color: "#4f46e5",
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
      color: "#4f46e5",
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
      return Math.sqrt(dx * dx + dy * dy) <= 30;
    });
  }

  // --- Mouse Events ---
  function handleMouseDown(e) {
    const pos = getMousePos(e);
    const node = getNodeAtPoint(pos.x, pos.y);

    if (node) {
      // Always allow dragging
      setIsDragging(true);
      setDragNodeId(node.id);
      setDragOffset({
        x: pos.x - node.x,
        y: pos.y - node.y
      });

      // Handle algorithm selection only if not animating
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
    function closeMenu() {
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    }
    if (contextMenu.visible) {
      window.addEventListener("mousedown", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
      window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
      return () => {
        window.removeEventListener("mousedown", closeMenu);
        window.removeEventListener("scroll", closeMenu, true);
        window.removeEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
      };
    }
  }, [contextMenu.visible]);

  function editNodeLabel(nodeId) {
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setEditingNode(nodeId);
      setLabelInput(node.label);
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
    
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]));
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
    
    const verticalGap = 100;
    const nodeGap = 80;
    const baseY = 80;
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
    setNodes(prev => prev.map(n => ({ ...n, color: "#4f46e5" })));
    
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
      nodes.forEach(node => setNodeColor(node.id, "#4f46e5"));
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
        ctx.lineWidth = e.highlighted ? 4 : 2.5;
        ctx.lineCap = "round";

        if (e.isSelfLoop) {
          // Improved self-loop rendering
          const loopRadius = 35;
          const angle = Math.atan2(0, 1); // Default upward
          const loopCenterX = a.x + loopRadius * Math.cos(angle);
          const loopCenterY = a.y - loopRadius * Math.sin(angle) - loopRadius;
          
          ctx.beginPath();
          ctx.arc(loopCenterX, loopCenterY, loopRadius, 0, 2 * Math.PI);
          ctx.stroke();
          
          if (isDirected) {
            const arrowX = loopCenterX + loopRadius * Math.cos(Math.PI / 3);
            const arrowY = loopCenterY + loopRadius * Math.sin(Math.PI / 3);
            const arrowLength = 15;
            const arrowAngle = Math.PI / 6;
            const tangentAngle = Math.PI / 3 + Math.PI / 2;
            
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
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(loopCenterX - 12, loopCenterY - loopRadius - 25, 24, 16);
            ctx.fillStyle = "#1f2937";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(e.weight, loopCenterX, loopCenterY - loopRadius - 17);
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
            const curvature = 0.2;
            
            // Calculate control point for curve
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
              // Calculate arrow position on curve
              const t = 0.8; // Position along curve for arrow
              const arrowX = (1-t)*(1-t)*a.x + 2*(1-t)*t*controlX + t*t*b.x;
              const arrowY = (1-t)*(1-t)*a.y + 2*(1-t)*t*controlY + t*t*b.y;
              
              // Calculate tangent for arrow direction
              const tangentX = 2*(1-t)*(controlX - a.x) + 2*t*(b.x - controlX);
              const tangentY = 2*(1-t)*(controlY - a.y) + 2*t*(b.y - controlY);
              const angle = Math.atan2(tangentY, tangentX);
              
              const arrowLength = 15;
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
              
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(weightX - 12, weightY - 8, 24, 16);
              ctx.fillStyle = "#1f2937";
              ctx.font = "bold 12px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(e.weight, weightX, weightY + 4);
            }
          } else {
            // Draw straight edge
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            if (isDirected) {
              const angle = Math.atan2(b.y - a.y, b.x - a.x);
              const arrowLength = 15;
              const arrowAngle = Math.PI / 6;
              const endX = b.x - 32 * Math.cos(angle);
              const endY = b.y - 32 * Math.sin(angle);
              
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
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(midX - 12, midY - 8, 24, 16);
              ctx.fillStyle = "#1f2937";
              ctx.font = "bold 12px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText(e.weight, midX, midY + 4);
            }
          }
        }
      }
    });

    // Draw nodes with enhanced styling
    nodes.forEach(n => {
      const isSelected = selectedNodes.includes(n.id);
      const isDragged = dragNodeId === n.id;

      // Node shadow
      ctx.beginPath();
      ctx.arc(n.x + 3, n.y + 3, 32, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fill();

      // Node body with gradient
      const gradient = ctx.createRadialGradient(n.x - 8, n.y - 8, 0, n.x, n.y, 32);
      gradient.addColorStop(0, n.color + "FF");
      gradient.addColorStop(1, n.color + "CC");
      
      ctx.beginPath();
      ctx.arc(n.x, n.y, 30, 0, 2 * Math.PI);
      ctx.fillStyle = isDragged ? n.color + "DD" : gradient;
      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? "#fbbf24" : "#ffffff";
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.stroke();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(n.x - 6, n.y - 6, 8, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fill();

      // Node ID
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 2;
      ctx.fillText(n.id, n.x, n.y);
      ctx.shadowBlur = 0;

      // Node label
      if (n.label) {
        ctx.fillStyle = "#1f2937";
        ctx.font = "14px sans-serif";
        ctx.fillText(n.label, n.x, n.y + 55);
      }
    });

    ctx.restore();
  }

  useEffect(draw, [nodes, edges, dpr, dragNodeId, currentAlgorithm, selectedNodes]);
  useEffect(() => { parseInput(); }, []);

  // --- UI ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Graph Algorithm Visualizer
              </h1>
              <p className="text-gray-600 mt-1">Interactive graph visualization with advanced algorithms</p>
            </div>
            <button
              onClick={() => setShowControls(!showControls)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-2 rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              {showControls ? "Hide Controls" : "Show Controls"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {showControls && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl mb-6 overflow-hidden border border-gray-200">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Controls</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Graph Definition</label>
                    <textarea
                      className="w-full border-2 border-gray-200 rounded-xl p-4 font-mono text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all duration-200 bg-gray-50"
                      rows={8}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="Nodes: 0, 1, 2&#10;Edges: 0 1 [weight]&#10;Self-loops: 2 2 [weight]"
                      disabled={isAnimating}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 shadow-lg"
                      onClick={parseInput}
                      disabled={isAnimating}
                    >
                      Generate Graph
                    </button>
                    <button
                      className="flex-1 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 shadow-lg"
                      onClick={resetAlgorithmState}
                      disabled={isAnimating}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isDirected}
                        onChange={e => setIsDirected(e.target.checked)}
                        disabled={isAnimating}
                        className="mr-3 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      Directed Graph
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Algorithms</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      className={`px-6 py-4 rounded-xl text-sm font-medium transition-all duration-200 shadow-lg ${
                        currentAlgorithm === "cycles" 
                          ? "bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-red-200" 
                          : "bg-gradient-to-r from-red-100 to-pink-100 hover:from-red-200 hover:to-pink-200 text-red-700"
                      }`}
                      onClick={() => runAlgorithm("cycles")}
                      disabled={isAnimating}
                    >
                      🔍 Detect Cycles
                    </button>
                    <button
                      className={`px-6 py-4 rounded-xl text-sm font-medium transition-all duration-200 shadow-lg ${
                        currentAlgorithm === "findpaths" 
                          ? "bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-teal-200" 
                          : "bg-gradient-to-r from-teal-100 to-cyan-100 hover:from-teal-200 hover:to-cyan-200 text-teal-700"
                      }`}
                      onClick={() => {
                        resetAlgorithmState();
                        setCurrentAlgorithm("findpaths");
                      }}
                      disabled={isAnimating}
                    >
                      🛤️ Find All Paths
                    </button>
                  </div>
                  
                  {currentAlgorithm === "findpaths" && selectedNodes.length === 2 && (
                    <button
                      className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 shadow-lg"
                      disabled={isAnimating}
                      onClick={() => runAlgorithm("findpaths")}
                    >
                      Show Paths: {selectedNodes[0]} → {selectedNodes[1]}
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Layout & Settings</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Animation Speed</label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      value={speed}
                      onChange={e => setSpeed(Number(e.target.value))}
                      disabled={isAnimating}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="text-xs text-gray-500 mt-1 text-center">{speed} ms</div>
                  </div>
                  <button
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 shadow-lg"
                    onClick={() => hangTreeFromRoot()}
                    disabled={isAnimating || selectedNodes.length === 0}
                  >
                    🌲 Arrange as Tree from Selected
                  </button>
                  <div className="text-xs text-gray-500 mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="font-semibold">💡 Pro Tips:</span><br/>
                    • <span className="font-medium">Right-click</span> any node for quick actions<br/>
                    • <span className="font-medium">Drag</span> nodes to reposition them<br/>
                    • Select nodes by clicking for algorithms
                  </div>
                  {selectedNodes.length > 0 && (currentAlgorithm !== "findpaths" || selectedNodes.length === 1) && (
                    <div className="mt-2 text-xs text-indigo-700 font-medium bg-indigo-50 p-2 rounded-lg">
                      Selected: Node {selectedNodes[0]}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canvas & Results */}
        <div className="flex flex-col items-center">
          <div className="border-2 border-gray-200 rounded-2xl bg-white shadow-2xl relative overflow-hidden">
            <canvas
              ref={canvasRef}
              width={width * dpr}
              height={height * dpr}
              style={{ 
                width: `${width}px`, 
                height: `${height}px`, 
                display: "block", 
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
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
                  zIndex: 9999,
                  background: "white",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  minWidth: 200,
                  overflow: "hidden"
                }}
                onContextMenu={e => e.preventDefault()}
              >
                <button
                  className="block w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm font-medium text-gray-700 transition-colors"
                  onClick={() => editNodeLabel(contextMenu.nodeId)}
                >
                  ✏️ Edit Label
                </button>
                <button
                  className="block w-full text-left px-4 py-3 hover:bg-green-50 text-sm font-medium text-gray-700 transition-colors border-t border-gray-100"
                  onClick={() => hangTreeFromRootRightClick(contextMenu.nodeId)}
                >
                  🌲 Arrange Tree from Here
                </button>
              </div>
            )}
          </div>

          {/* Edit node label dialog */}
          {editingNode !== null && (
            <div className="mt-6 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="font-semibold mb-4 text-gray-900">Edit Label for Node {editingNode}</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  placeholder="Enter node label"
                  className="border-2 border-gray-200 px-4 py-2 rounded-lg flex-1 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all duration-200"
                  onKeyPress={e => e.key === "Enter" && saveLabel()}
                  autoFocus
                />
                <button
                  onClick={saveLabel}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Results & Paths */}
          {algorithmState.cycleCount > 0 && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-6 shadow-lg">
              <p className="text-lg text-red-700 font-semibold mb-4 flex items-center gap-2">
                🔍 Found {algorithmState.cycleCount} cycle{algorithmState.cycleCount > 1 ? 's' : ''}:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {foundCycles.map((cycle, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-red-200">
                    <span className="text-sm font-medium text-gray-600">Cycle {idx + 1}:</span>
                    <div className="text-sm text-gray-800 font-mono mt-1">
                      [{cycle.join(" → ")}]
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {pathsBetweenNodes.length > 0 && (
            <div className="mt-6 bg-teal-50 border border-teal-200 rounded-xl p-6 shadow-lg">
              <p className="text-lg text-teal-700 font-semibold mb-4 flex items-center gap-2">
                🛤️ Found {pathsBetweenNodes.length} path{pathsBetweenNodes.length > 1 ? 's' : ''} between {selectedNodes[0]} and {selectedNodes[1]}:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pathsBetweenNodes.map((path, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-teal-200">
                    <span className="text-sm font-medium text-gray-600">Path {idx + 1}:</span>
                    <div className="text-sm text-gray-800 font-mono mt-1">
                      [{path.join(" → ")}]
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 mb-8 text-center text-sm text-gray-600 max-w-4xl mx-auto px-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-4">How to Use</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">🎯 Basic Interactions</h4>
              <ul className="space-y-1 text-xs">
                <li>• <strong>Drag nodes</strong> to reposition them</li>
                <li>• <strong>Right-click nodes</strong> for quick actions</li>
                <li>• <strong>Click nodes</strong> to select for algorithms</li>
                <li>• Toggle between directed/undirected graphs</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-2">🔬 Algorithms</h4>
              <ul className="space-y-1 text-xs">
                <li>• <strong>Find All Paths:</strong> Select 2 nodes, then run</li>
                <li>• <strong>Detect Cycles:</strong> Finds all cycles in graph</li>
                <li>• <strong>Tree Layout:</strong> Arranges graph as tree</li>
                <li>• Self-loops and weighted edges supported</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}