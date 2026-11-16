import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const MOMENT_SLIDES = [
  {
    src: '/landing-page/images/ekklesphere-volunteer.jpg',
    alt: 'Church volunteers organizing community donations together',
    index: '01 / 03',
    title: 'Good work, shared.',
    description:
      'Make room for the teams who show up early, stay late, and make Sunday feel simple.',
    caption: 'Volunteer coordination',
  },
  {
    src: '/landing-page/images/ekklesphere-worship.jpg',
    alt: 'A congregation gathered in warm light during worship',
    index: '02 / 03',
    title: 'People, present.',
    description:
      'Keep the bigger picture in view while your team stays close to the people in front of them.',
    caption: 'Community & belonging',
  },
  {
    src: '/landing-page/images/ekklesphere-team.jpg',
    alt: 'A diverse church leadership team collaborating around a table',
    index: '03 / 03',
    title: 'Move with context.',
    description:
      'Give leaders a shared source of truth for the conversations that shape the week.',
    caption: 'Leadership alignment',
  },
];

export const LandingMomentsSlider: React.FC = () => {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % MOMENT_SLIDES.length);
    }, 6200);
    return () => window.clearInterval(timer);
  }, []);

  const stepSlide = (delta: number) => {
    setActiveSlide((prev) => (prev + delta + MOMENT_SLIDES.length) % MOMENT_SLIDES.length);
  };

  const slide = MOMENT_SLIDES[activeSlide];

  return (
    <section id="moments" className="bg-[#f7f3ec] py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-14">
        {/* Heading Div */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
              The moments that matter
            </div>
            <h2 className="mt-4 text-[clamp(2.25rem,4.5vw,3.75rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#0b1f33] text-balance">
              See the work
              <br />
              <em className="font-display font-normal italic">behind the work.</em>
            </h2>
          </div>

          <div className="lg:col-span-5">
            <p className="max-w-[420px] text-base leading-relaxed text-[#5c6876]">
              A healthy church is built in a hundred small moments. Ekklesphere helps your team
              notice, coordinate, and care for each one.
            </p>
          </div>
        </div>

        {/* Slider Card Div */}
        <div
          aria-roledescription="carousel"
          aria-label="Ministry moments"
          className="mt-10"
        >
          <div className="grid grid-cols-1 overflow-hidden rounded-xl bg-[#e8e0d4] lg:grid-cols-12">
            <div className="lg:col-span-8 h-64 sm:h-80 lg:h-[420px] overflow-hidden bg-[#c5d4d8]">
              <img
                key={slide.src}
                src={slide.src}
                alt={slide.alt}
                className="h-full w-full object-cover saturate-[0.78] contrast-[0.96] transition-transform duration-500"
              />
            </div>

            <div className="lg:col-span-4 flex flex-col justify-center bg-[#e8e0d4] p-7 sm:p-10 lg:p-12">
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#7a6d5e]">
                {slide.index}
              </div>
              <h3 className="mt-4 text-3xl sm:text-4xl font-bold leading-[1.04] tracking-tight text-[#0b1f33]">
                {slide.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-[#57615e]">{slide.description}</p>
              <div className="mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-[#786342]">
                {slide.caption}
              </div>
            </div>
          </div>

          {/* Controls Div */}
          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-2" role="tablist" aria-label="Choose a ministry moment">
              {MOMENT_SLIDES.map((item, idx) => {
                const isActive = idx === activeSlide;
                return (
                  <button
                    key={item.index}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Show moment ${idx + 1}`}
                    onClick={() => setActiveSlide(idx)}
                    className={`h-1 transition-all ${
                      isActive ? 'w-14 bg-[#e1ad3f]' : 'w-8 bg-[#d2cbc0] hover:bg-[#b5ada1]'
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepSlide(-1)}
                aria-label="Previous moment"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#cfc7ba] text-[#0b1f33] transition-colors hover:bg-[#0b1f33] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => stepSlide(1)}
                aria-label="Next moment"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#cfc7ba] text-[#0b1f33] transition-colors hover:bg-[#0b1f33] hover:text-white"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
