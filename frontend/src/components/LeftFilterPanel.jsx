const DEPTH_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Surface', value: 'surface' },
  { label: '0–100 m', value: '0-100' },
  { label: '100–500 m', value: '100-500' },
  { label: '500–1000 m', value: '500-1000' },
  { label: '1000+ m', value: '1000+' },
]

const VARIABLE_OPTIONS = [
  { label: 'Temperature', value: 'temperature' },
  { label: 'Salinity', value: 'salinity' },
]

export default function LeftFilterPanel({
  filters,
  onFilterChange,
  collapsed,
  onToggleCollapse,
}) {
  const update = (key, value) => onFilterChange({ ...filters, [key]: value })

  const resetFilters = () => onFilterChange({
    dataSource: { argo: true, godas: true, inSitu: false },
    variable: 'temperature',
    depth: 'all',
    anomalyMode: 'all',
    status: { active: true, inactive: false },
  })

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="absolute top-14 left-3 z-20 w-10 h-10 flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[20px]">filter_list</span>
      </button>
    )
  }

  return (
    <div className="absolute top-14 left-3 z-20 w-60 max-h-[calc(100vh-5rem)] flex flex-col bg-surface-container-lowest/90 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
        <span className="text-[12px] font-bold text-on-surface tracking-wider uppercase font-mono">Filters</span>
        <button
          onClick={onToggleCollapse}
          className="text-on-surface-variant hover:text-on-surface p-0.5 rounded hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Data Source */}
        <FilterSection title="Data Source">
          <Checkbox
            label="ARGO"
            checked={filters.dataSource.argo}
            onChange={v => update('dataSource', { ...filters.dataSource, argo: v })}
          />
          <Checkbox
            label="GODAS"
            checked={filters.dataSource.godas}
            onChange={v => update('dataSource', { ...filters.dataSource, godas: v })}
          />
          <Checkbox
            label="In-Situ"
            checked={filters.dataSource.inSitu}
            onChange={v => update('dataSource', { ...filters.dataSource, inSitu: v })}
          />
        </FilterSection>

        {/* Variable */}
        <FilterSection title="Variable">
          {VARIABLE_OPTIONS.map(opt => (
            <Radio
              key={opt.value}
              label={opt.label}
              checked={filters.variable === opt.value}
              onChange={() => update('variable', opt.value)}
            />
          ))}
        </FilterSection>

        {/* Depth */}
        <FilterSection title="Depth">
          {DEPTH_OPTIONS.map(opt => (
            <Radio
              key={opt.value}
              label={opt.label}
              checked={filters.depth === opt.value}
              onChange={() => update('depth', opt.value)}
            />
          ))}
        </FilterSection>

        {/* Status */}
        <FilterSection title="Status">
          <Checkbox
            label="Active"
            checked={filters.status.active}
            onChange={v => update('status', { ...filters.status, active: v })}
          />
          <Checkbox
            label="Inactive"
            checked={filters.status.inactive}
            onChange={v => update('status', { ...filters.status, inactive: v })}
          />
        </FilterSection>
      </div>

      {/* Reset button */}
      <div className="p-3 border-t border-outline-variant/20">
        <button
          onClick={resetFilters}
          className="w-full py-1.5 text-[11px] font-semibold text-on-surface-variant border border-outline-variant/30 rounded hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer font-mono uppercase tracking-wider"
        >
          Reset Filters
        </button>
      </div>
    </div>
  )
}

function FilterSection({ title, children }) {
  return (
    <div>
      <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-1.5">{title}</span>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Radio({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group py-0.5" onClick={onChange}>
      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${checked ? 'border-primary' : 'border-outline-variant/50 group-hover:border-outline'}`}>
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
      </span>
      <span className={`text-[12px] font-mono transition-colors ${checked ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'}`}>{label}</span>
    </label>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group py-0.5" onClick={() => onChange(!checked)}>
      <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'border-primary bg-primary' : 'border-outline-variant/50 group-hover:border-outline'}`}>
        {checked && <span className="material-symbols-outlined text-[11px] text-on-primary">check</span>}
      </span>
      <span className={`text-[12px] font-mono transition-colors ${checked ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'}`}>{label}</span>
    </label>
  )
}
