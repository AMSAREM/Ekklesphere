const menuToggle = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

menuToggle?.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  mobileMenu.setAttribute('aria-hidden', String(!open));
  menuToggle.querySelectorAll('span')[0].style.transform = open ? 'translateY(4px) rotate(45deg)' : '';
  menuToggle.querySelectorAll('span')[1].style.transform = open ? 'translateY(-4px) rotate(-45deg)' : '';
});

document.querySelectorAll('.mobile-menu a').forEach((link) => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    mobileMenu?.setAttribute('aria-hidden', 'true');
    menuToggle?.querySelectorAll('span').forEach((line) => { line.style.transform = ''; });
  });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

document.querySelectorAll('.workflow-step').forEach((step) => {
  step.addEventListener('click', () => {
    document.querySelectorAll('.workflow-step').forEach((item) => item.classList.remove('active'));
    step.classList.add('active');
  });
});

const slides = [...document.querySelectorAll('.moment-slide')];
const dots = [...document.querySelectorAll('.slider-dot')];
let currentSlide = 0;
let sliderTimer;

function showSlide(index) {
  if (!slides.length) return;
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle('is-active', i === currentSlide));
  dots.forEach((dot, i) => {
    const active = i === currentSlide;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', String(active));
  });
}

function restartSlider() {
  window.clearInterval(sliderTimer);
  sliderTimer = window.setInterval(() => showSlide(currentSlide + 1), 6200);
}

dots.forEach((dot) => dot.addEventListener('click', () => {
  showSlide(Number(dot.dataset.goTo));
  restartSlider();
}));

document.querySelectorAll('.slider-arrow').forEach((arrow) => arrow.addEventListener('click', () => {
  showSlide(currentSlide + (arrow.dataset.direction === 'next' ? 1 : -1));
  restartSlider();
}));

if (slides.length) {
  showSlide(0);
  restartSlider();
}

const heroSlides = [...document.querySelectorAll('.hero-photo-slide')];
const heroDots = [...document.querySelectorAll('.hero-photo-dot')];
let heroSlideIndex = 0;
let heroTimer;

function showHeroSlide(index) {
  if (!heroSlides.length) return;
  heroSlideIndex = (index + heroSlides.length) % heroSlides.length;
  heroSlides.forEach((slide, i) => slide.classList.toggle('is-active', i === heroSlideIndex));
  heroDots.forEach((dot, i) => dot.classList.toggle('is-active', i === heroSlideIndex));
}

function restartHeroSlider() {
  window.clearInterval(heroTimer);
  heroTimer = window.setInterval(() => showHeroSlide(heroSlideIndex + 1), 5200);
}

heroDots.forEach((dot) => dot.addEventListener('click', () => {
  showHeroSlide(Number(dot.dataset.heroGoTo));
  restartHeroSlider();
}));

document.querySelectorAll('.hero-photo-arrow').forEach((arrow) => arrow.addEventListener('click', () => {
  showHeroSlide(heroSlideIndex + (arrow.dataset.heroDirection === 'next' ? 1 : -1));
  restartHeroSlider();
}));

if (heroSlides.length) {
  showHeroSlide(0);
  restartHeroSlider();
}
