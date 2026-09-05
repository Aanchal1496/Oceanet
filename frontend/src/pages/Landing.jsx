import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-secondary/5 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-3xl text-center space-y-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-outline-variant/30 bg-surface-container-low/60 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono text-on-surface-variant tracking-wider uppercase">
            PS 67 — Ocean State Console
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-5xl md:text-6xl font-bold text-on-surface leading-tight tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          See How Accurate
          <br />
          <span className="text-primary">Ocean Forecasts</span> Really Are
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          A web platform that visualizes ocean model predictions against real float and buoy observations — spatially, in 3D, across depth and time.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={() => navigate('/console')}
            className="px-8 py-3.5 bg-primary text-on-primary font-semibold rounded-lg text-sm tracking-wide hover:bg-primary-container transition-colors shadow-lg shadow-primary/20 cursor-pointer"
          >
            Launch Console
          </button>
          <button
            onClick={() => navigate('/report')}
            className="px-8 py-3.5 bg-surface-container border border-outline-variant/30 text-on-surface font-semibold rounded-lg text-sm tracking-wide hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            View Report
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-12 text-left">
          <FeatureCard
            icon="view_in_ar"
            title="3D Depth Layers"
            desc="Explore ocean temperature across surface, thermocline, and deep layers"
          />
          <FeatureCard
            icon="compare"
            title="Model vs Reality"
            desc="Click any Argo float to see how model predictions compare to real observations"
          />
          <FeatureCard
            icon="timeline"
            title="Temporal Animation"
            desc="Scrub through time to watch how forecast accuracy evolves day by day"
          />
        </div>

        {/* Footer note */}
        <p className="text-xs text-on-surface-variant/50 pt-8 font-mono">
          Built for Smart India Hackathon 2026 — Indian Ocean Forecast Validation
        </p>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="p-4 rounded-lg bg-surface-container/50 border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
      <span className="material-symbols-outlined text-primary text-xl mb-2 block">{icon}</span>
      <h3 className="text-sm font-semibold text-on-surface mb-1">{title}</h3>
      <p className="text-xs text-on-surface-variant leading-relaxed">{desc}</p>
    </div>
  )
}
