import React, { useState } from 'react';
import { PluginSettings } from './Plugins.js';
import { ChartsSettings } from './Charts.js';
import { ReportsSettings } from './Reports.js';
export function PluginCatalog() {
  const [selected, setSelected] = useState('reports');
  const plugins = [
    {
      id: 'reports',
      label: 'Reports',
      description: 'Branded PDF reports',
      view: <ReportsSettings />,
    },
    { id: 'charts', label: 'Charts', description: 'Visualize your data', view: <ChartsSettings /> },
    {
      id: 'mssql',
      label: 'MSSQL',
      description: 'SQL Server connections',
      view: <PluginSettings />,
    },
  ];
  return (
    <div className="plugin-catalog">
      <nav aria-label="Plugin settings">
        {plugins.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={`${p.label} plugin`}
            aria-pressed={selected === p.id}
            onClick={() => setSelected(p.id)}
          >
            <strong>{p.label}</strong>
            <span>{p.description}</span>
          </button>
        ))}
      </nav>
      <div className="plugin-detail">
        {plugins.map((p) => (
          <div key={p.id} hidden={selected !== p.id}>
            {p.view}
          </div>
        ))}
      </div>
    </div>
  );
}
