import React, { useState } from 'react';
import { ArrowUpRight, Layers, Sparkles, Target } from 'lucide-react';

interface LandingWorkflowSectionProps {
  onOpenDemo: () => void;
}

const WORKFLOW_STEPS = [
  {
    number: '01',
    title: 'Gather the signal',
    description:
      'Bring people, forms, groups, giving, and Sunday attendance data into one calm workspace.',
    icon: Layers,
  },
  {
    number: '02',
    title: 'Find the next right thing',
    description:
      'Make follow-ups and team priorities visible before they become loose ends.',
    icon: Target,
  },
  {
    number: '03',
    title: 'Move as one team',
    description:
      'Keep every ministry in step with shared context and fewer meetings about meetings.',
    icon: Sparkles,
  },
];

export const LandingWorkflowSection: React.FC<LandingWorkflowSectionProps> = ({
  onOpenDemo,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="workflow" className="bg-[#f7f3ec] py-16 sm:py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-20 lg:px-14">
        {/* Left Copy Div */}
        <div className="lg:col-span-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
            A clearer rhythm
          </div>
          <h2 className="mt-4 text-[clamp(2.25rem,4.5vw,3.75rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#0b1f33] text-balance">
            Less chasing.
            <br />
            <em className="font-display font-normal italic">More together.</em>
          </h2>
          <p className="mt-5 max-w-[390px] text-base leading-relaxed text-[#5c6876]">
            Ekklesphere turns the invisible work of church leadership into a shared rhythm your
            whole team can feel.
          </p>

          <button
            type="button"
            onClick={onOpenDemo}
            className="mt-8 inline-flex min-h-[44px] items-center gap-3 rounded-full bg-[#0b1f33] px-6 py-3 text-xs font-bold text-[#fffdf9] shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#122e48]"
          >
            <span>See your church in motion</span>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Right Interactive Steps Div */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="divide-y divide-[#d9d4ca] border-t border-b border-[#d9d4ca]">
            {WORKFLOW_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeStep === idx;
              return (
                <div key={step.number}>
                  <button
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    className={`grid w-full grid-cols-[44px_1fr_32px] items-start gap-4 py-6 text-left transition-all ${
                      isActive ? 'opacity-100' : 'opacity-60 hover:translate-x-1 hover:opacity-90'
                    }`}
                  >
                    <span className="pt-1 text-xs font-bold tabular-nums text-[#7c8582]">
                      {step.number}
                    </span>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-[#0b1f33]">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 max-w-[360px] text-sm leading-relaxed text-[#5c6876]">
                        {step.description}
                      </p>
                    </div>
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full border transition-colors ${
                        isActive
                          ? 'border-[#e1ad3f] bg-[#e1ad3f] text-[#0b1f33]'
                          : 'border-[#d6d2c8] text-[#6d7676]'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center gap-3 text-xs text-[#6d7671]">
            <span className="h-px w-9 bg-[#c9c5bc]" aria-hidden="true" />
            <span>Built for the way ministry actually happens.</span>
          </div>
        </div>
      </div>
    </section>
  );
};
