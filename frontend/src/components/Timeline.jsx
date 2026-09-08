import { useRef } from 'react'

export default function Timeline({ dates, activeDay, onDayChange, playing, onPlayToggle }) {
  const sliderRef = useRef(null)

  if (!dates || dates.length === 0) return null

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const y = dateStr.slice(0, 4)
    const m = dateStr.slice(4, 6)
    const d = dateStr.slice(6, 8)
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    return `${d} ${months[parseInt(m) - 1]} ${y}`
  }

  const currentDate = dates[activeDay - 1] || ''
  const firstDate = dates[0] || ''
  const lastDate = dates[dates.length - 1] || ''
  const progress = dates.length > 1 ? ((activeDay - 1) / (dates.length - 1)) * 100 : 0

  return (
    <div className="absolute bottom-12 left-0 right-0 z-20 px-12">
      <div className="bg-surface-container-lowest/85 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md px-4 py-2.5">
        <div className="flex items-center gap-3">
          {/* Play/pause */}
          <button
            onClick={onPlayToggle}
            className="w-7 h-7 rounded-full border border-outline-variant/30 bg-transparent text-on-surface flex items-center justify-center hover:border-primary transition-colors cursor-pointer flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">{playing ? 'pause' : 'play_arrow'}</span>
          </button>

          {/* Start date */}
          <span className="text-[10px] font-mono text-on-surface-variant flex-shrink-0 w-20">
            {formatDate(firstDate)}
          </span>

          {/* Slider track */}
          <div className="flex-1 relative h-6 flex items-center" ref={sliderRef}>
            {/* Background track */}
            <div className="absolute w-full h-1 bg-outline-variant/30 rounded-full" />

            {/* Progress fill */}
            <div
              className="absolute h-1 bg-primary rounded-full transition-all duration-75"
              style={{ width: `${progress}%` }}
            />

            {/* Day markers */}
            {dates.map((date, i) => {
              const pos = dates.length > 1 ? (i / (dates.length - 1)) * 100 : 50
              return (
                <button
                  key={i}
                  onClick={() => onDayChange(i + 1)}
                  className="absolute w-2 h-2 rounded-full border border-outline-variant/40 hover:border-primary hover:bg-primary/30 transition-colors cursor-pointer"
                  style={{ left: `${pos}%`, transform: 'translateX(-50%)', top: '50%', marginTop: '-4px' }}
                  title={formatDate(date)}
                />
              )
            })}

            {/* Current position indicator */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-primary border-2 border-on-primary shadow-lg shadow-primary/30 transition-all duration-75 z-10"
              style={{ left: `${progress}%`, transform: 'translateX(-50%)', top: '50%', marginTop: '-7px' }}
            />

            {/* Hidden range input for keyboard/accessibility */}
            <input
              type="range"
              min={1}
              max={dates.length}
              value={activeDay}
              onChange={e => onDayChange(parseInt(e.target.value))}
              className="absolute w-full opacity-0 cursor-pointer h-6 z-20"
            />
          </div>

          {/* End date */}
          <span className="text-[10px] font-mono text-on-surface-variant flex-shrink-0 w-20 text-right">
            {formatDate(lastDate)}
          </span>

          {/* Current date display */}
          <div className="flex-shrink-0 text-[11px] font-mono text-on-surface bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20">
            {formatDate(currentDate)}
          </div>
        </div>
      </div>
    </div>
  )
}
