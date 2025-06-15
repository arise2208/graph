import React, { useState, useEffect } from 'react';

export default function NodeTable({ nodes, onNodesUpdate, isAnimating }) {
  const [tableNodes, setTableNodes] = useState([]);
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');

  // Sync with parent nodes
  useEffect(() => {
    setTableNodes(nodes.map(node => ({
      id: node.id,
      label: node.label || ''
    })));
  }, [nodes]);

  // Filter and sort nodes
  const filteredAndSortedNodes = tableNodes
    .filter(node => 
      node.id.toString().includes(searchTerm) || 
      node.label.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aVal = sortBy === 'id' ? a.id : a.label;
      let bVal = sortBy === 'id' ? b.id : b.label;
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

  const addNode = () => {
    const id = parseInt(newNodeId);
    if (isNaN(id) || tableNodes.some(n => n.id === id)) {
      alert('Please enter a valid unique node ID');
      return;
    }

    const newNode = {
      id,
      label: newNodeLabel
    };

    const updatedTableNodes = [...tableNodes, newNode];
    setTableNodes(updatedTableNodes);
    
    // Update parent component
    onNodesUpdate(updatedTableNodes);
    
    setNewNodeId('');
    setNewNodeLabel('');
  };

  const startEdit = (node) => {
    setEditingId(node.id);
    setEditingLabel(node.label);
  };

  const saveEdit = () => {
    const updatedTableNodes = tableNodes.map(node =>
      node.id === editingId
        ? { ...node, label: editingLabel }
        : node
    );
    
    setTableNodes(updatedTableNodes);
    onNodesUpdate(updatedTableNodes);
    
    setEditingId(null);
    setEditingLabel('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingLabel('');
  };

  const deleteNode = (nodeId) => {
    if (confirm(`Delete node ${nodeId}?`)) {
      const updatedTableNodes = tableNodes.filter(n => n.id !== nodeId);
      setTableNodes(updatedTableNodes);
      onNodesUpdate(updatedTableNodes);
    }
  };

  const exportData = () => {
    const data = tableNodes.map(n => `${n.id},${n.label || ''}`).join('\n');
    const blob = new Blob([`ID,Label\n${data}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nodes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const batchUpdate = () => {
    const input = prompt('Enter nodes in format: id1:label1,id2:label2,...');
    if (!input) return;

    try {
      const pairs = input.split(',').map(pair => {
        const [id, label] = pair.split(':');
        return { id: parseInt(id.trim()), label: (label || '').trim() };
      });

      const updatedTableNodes = [...tableNodes];
      pairs.forEach(({ id, label }) => {
        if (!isNaN(id)) {
          const existingIndex = updatedTableNodes.findIndex(n => n.id === id);
          if (existingIndex >= 0) {
            updatedTableNodes[existingIndex] = {
              ...updatedTableNodes[existingIndex],
              label
            };
          } else {
            updatedTableNodes.push({
              id,
              label
            });
          }
        }
      });

      setTableNodes(updatedTableNodes);
      onNodesUpdate(updatedTableNodes);
    } catch (error) {
      alert('Invalid format. Use: id1:label1,id2:label2,...');
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Node Labels</h3>
          <div className="flex gap-2">
            <button
              onClick={batchUpdate}
              disabled={isAnimating}
              className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded disabled:opacity-50"
            >
              Batch Update
            </button>
            <button
              onClick={exportData}
              className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Add New Node */}
        <div className="flex gap-2 mb-4">
          <input
            type="number"
            placeholder="Node ID"
            value={newNodeId}
            onChange={(e) => setNewNodeId(e.target.value)}
            disabled={isAnimating}
            className="w-24 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Label"
            value={newNodeLabel}
            onChange={(e) => setNewNodeLabel(e.target.value)}
            disabled={isAnimating}
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && addNode()}
          />
          <button
            onClick={addNode}
            disabled={isAnimating || !newNodeId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {/* Search and Sort */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Search nodes or labels..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}
            className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="id-asc">ID ↑</option>
            <option value="id-desc">ID ↓</option>
            <option value="label-asc">Label ↑</option>
            <option value="label-desc">Label ↓</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Node ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Label
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedNodes.length === 0 ? (
              <tr>
                <td colSpan="3" className="px-4 py-8 text-center text-gray-500">
                  {searchTerm ? 'No nodes match your search' : 'No nodes added yet'}
                </td>
              </tr>
            ) : (
              filteredAndSortedNodes.map((node) => (
                <tr key={node.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {node.id}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {editingId === node.id ? (
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                        onClick={() => startEdit(node)}
                      >
                        {node.label || <em className="text-gray-400">Click to add label</em>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {editingId === node.id ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={saveEdit}
                          className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => startEdit(node)}
                          disabled={isAnimating}
                          className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteNode(node.id)}
                          disabled={isAnimating}
                          className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredAndSortedNodes.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
          Showing {filteredAndSortedNodes.length} of {tableNodes.length} nodes
        </div>
      )}
    </div>
  );
}