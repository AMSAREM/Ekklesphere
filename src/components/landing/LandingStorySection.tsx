import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export const LandingStorySection: React.FC = () => {
  return (
    <section id="stories" className="bg-[#f7f3ec] py-16 sm:py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16 lg:px-14">
        {/* Quote Column Div */}
        <div className="lg:col-span-7">
          <div
            aria-hidden="true"
            className="font-display text-7xl leading-none text-[#e1ad3f]"
          >
            “
          </div>

          <blockquote className="mt-2 max-w-[650px] text-2xl sm:text-4xl lg:text-[2.65rem] font-bold leading-[1.12] tracking-[-0.03em] text-[#0b1f33]">
            Ekklesphere helped us stop asking{' '}
            <em className="font-display font-normal italic">‘who has that information?’</em> and
            start asking <em className="font-display font-normal italic">‘who needs care today?’</em>
          </blockquote>

          <div className="mt-8 flex items-center gap-3.5">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#e5b49e] text-xs font-bold text-[#0b1f33]">
              JM
            </div>
            <div>
              <div className="text-sm font-bold text-[#0b1f33]">Jamie Mitchell</div>
              <div className="text-xs text-[#6e7774]">Executive Pastor, Harbor Church</div>
            </div>
          </div>
        </div>

        {/* Aside Card + Illustration Div */}
        <div className="lg:col-span-5 relative min-h-[340px]">
          <div className="relative z-10 ml-auto mr-2 sm:mr-6 w-64 rounded-lg bg-[#0b1f33] p-6 text-[#fffdf7] shadow-xl rotate-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#d5c0a2]">
              A note from Jamie
            </div>
            <p className="mt-6 font-display text-lg leading-snug text-[#fffdf7]">
              “We didn&apos;t need another tool. We needed one shared language for how we lead
              people well.”
            </p>
            <div className="mt-6 h-px w-9 bg-[#e1ad3f]" aria-hidden="true" />
            <a
              href="#demo"
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#b5b9b2] hover:text-white"
            >
              <span>Read the Harbor Church story</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[#e1ad3f]" aria-hidden="true" />
            </a>
          </div>

          <div
            aria-hidden="true"
            className="relative -mt-40 h-72 w-full overflow-hidden rounded-xl bg-[#d9e6ea]"
          >
            <div className="absolute right-[16%] top-[16%] h-24 w-24 rounded-full bg-[#f2cd83]" />
            <div className="absolute -left-[20%] -bottom-24 h-48 w-[130%] -rotate-6 rounded-t-[100%] bg-[#aec1b0]" />
            <div className="absolute left-[12%] -bottom-24 h-44 w-[130%] rotate-6 rounded-t-[100%] bg-[#7f9b83]" />
          </div>
        </div>
      </div>
    </section>
  );
};
