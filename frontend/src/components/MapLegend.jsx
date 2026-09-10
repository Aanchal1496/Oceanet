const COLOR_SCALES = {
  temperature: {
    label: 'Temperature',
    unit: '°C',
    stops: [
      { t: 0.0, color: '#274e8c', label: '5' },
      { t: 0.3, color: '#2fb6a8', label: '15' },
      { t: 0.6, color: '#f2a65a', label: '25' },
      { t: 1.0, color: '#e4572e', label: '30+' },
    ],
  },
  salinity: {
    label: 'Salinity',
    unit: 'PSU',
    stops: [
      { t: 0.0, color: '#1a5276', label: '33' },
      { t: 0.35, color: '#2980b9', label: '34' },
      { t: 0.65, color: '#5ddacb', label: '35' },
      { t: 1.0, color: '#f39c12', label: '36+' },
    ],
  },
  delta: {
    label: 'ΔT (Model−Obs)',
    unit: '°C',
    stops: [
      { t: 0.0, color: '#2980b9', label: '-2' },
      { t: 0.25, color: '#5ddacb', label: '-1' },
      { t: 0.5, color: '#95a5a6', label: '0' },
      { t: 0.75, color: '#ffb873', label: '+1' },
      { t: 1.0, color: '#e74c3c', label: '+2' },
    ],
  },
  anomaly: {
    label: 'Anomaly Severity',
    unit: '',
    stops: [
      { t: 0.0, color: '#5ddacb', label: 'Normal' },
      { t: 0.5, color: '#ffb873', label: 'Moderate' },
      { t: 1.0, color: '#e74c3c', label: 'Severe' },
    ],
  },
  depth: {
    label: 'Depth',
    unit: 'm',
    stops: [
      { t: 0.0, color: '#2fb6a8', label: '0' },
      { t: 0.33, color: '#274e8c', label: '500' },
      { t: 0.66, color: '#1a237e', label: '1000' },
      { t: 1.0, color: '#0d0d3b', label: '2000+' },
    ],
  },
  oxygen: {
    label: 'Dissolved Oxygen',
    unit: 'µmol/kg',
    stops: [
      { t: 0.0, color: '#274e8c', label: '100' },
      { t: 0.4, color: '#2fb6a8', label: '180' },
      { t: 0.7, color: '#f2a65a', label: '240' },
      { t: 1.0, color: '#e4572e', label: '300+' },
    ],
  },
  pressure: {
    label: 'Pressure',
    unit: 'dbar',
    stops: [
      { t: 0.0, color: '#2fb6a8', label: '0' },
      { t: 0.4, color: '#274e8c', label: '20' },
      { t: 0.7, color: '#f2a65a', label: '40' },
      { t: 1.0, color: '#e4572e', label: '60+' },
    ],
  },
  currents: {
    label: 'Wind / Current Speed',
    unit: 'm/s',
    stops: [
      { t: 0.0, color: '#2fb6a8', label: '0' },
      { t: 0.5, color: '#f2a65a', label: '1' },
      { t: 1.0, color: '#e4572e', label: '2+' },
    ],
  },
}

export default function MapLegend({ variable = 'temperature' }) {
  const scale = COLOR_SCALES[variable] || COLOR_SCALES.temperature
  const gradientStops = scale.stops.map(s => `${s.color} ${s.t * 100}%`).join(', ')

  return (
    <div className="absolute bottom-16 left-3 z-20 bg-surface-container-lowest/90 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md px-3 py-2.5">
      <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-1.5">
        {scale.label}
      </span>
      <div
        className="h-2.5 rounded w-40"
        style={{ background: `linear-gradient(to right, ${gradientStops})` }}
      />
      <div className="flex justify-between mt-1">
        {scale.stops.map((s, i) => (
          <span key={i} className="text-[9px] font-mono text-on-surface-variant">
            {s.label}{scale.unit && i === 0 ? ` ${scale.unit}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
