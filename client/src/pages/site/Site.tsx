import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

const PHONE = '08189860086';
const ADDRESS = '9, Olowora Street, Igando, Lagos State';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-10 w-10" />
      <div className="leading-tight">
        <div className="font-serif text-lg font-bold text-white">
          WITH GOD Schools
        </div>
        <div className="text-xs text-gold-light">Igando · Lagos State</div>
      </div>
    </Link>
  );
}

const links = [
  ['/', 'Home'],
  ['/about', 'About'],
  ['/apply', 'How to Apply'],
  ['/contact', 'Contact'],
] as const;

export function SiteLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-navy-mid py-1.5 text-center text-xs text-gold-light">
        📍 {ADDRESS} &nbsp;|&nbsp; God Is Our Strength
      </div>
      <header className="sticky top-0 z-40 border-b-4 border-gold bg-navy">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <button
            className="text-2xl text-white md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            ☰
          </button>
          <nav
            className={`${open ? 'flex' : 'hidden'} absolute top-full right-0 left-0 flex-col gap-1 bg-navy p-4 md:static md:flex md:flex-row md:items-center md:gap-6 md:p-0`}
          >
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `text-sm font-medium ${isActive ? 'text-gold-light' : 'text-white/85 hover:text-white'}`
                }
              >
                {label}
              </NavLink>
            ))}
            <Link to="/student" className="btn-gold btn-sm" onClick={() => setOpen(false)}>
              Student Portal
            </Link>
            <Link
              to="/staff"
              className="btn-sm btn border border-white/30 text-white hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              Staff
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-navy text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
          <div>
            <div className="font-serif text-lg font-bold text-white">WITH GOD Schools</div>
            <div className="mb-2 text-xs text-gold-light">Nur. · Pry. · Sec.</div>
            <p className="text-sm">
              A Christ-centred school committed to academic excellence and
              moral development, serving families in Igando and the wider
              Lagos community.
            </p>
          </div>
          <div>
            <div className="mb-2 font-semibold text-white">Quick links</div>
            {links.map(([to, label]) => (
              <Link key={to} to={to} className="block py-0.5 text-sm hover:text-gold-light">
                {label}
              </Link>
            ))}
          </div>
          <div className="text-sm">
            <div className="mb-2 font-semibold text-white">Contact</div>
            9, Olowora Street
            <br />
            Igando, Lagos State, Nigeria
            <br />
            Phone: {PHONE}
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs">
          © {new Date().getFullYear()} WITH GOD Schools · "God Is Our Strength"
        </div>
      </footer>
    </div>
  );
}

function Banner({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <section className="bg-gradient-to-br from-navy to-navy-light py-16 text-center text-white">
      <div className="text-xs font-semibold tracking-[0.2em] text-gold-light uppercase">
        {eyebrow}
      </div>
      <h1 className="mx-auto mt-2 max-w-3xl px-4 text-4xl font-bold text-white">{title}</h1>
      <p className="mx-auto mt-3 max-w-2xl px-4 text-white/80">{sub}</p>
    </section>
  );
}

function Section(p: { eyebrow?: string; title?: string; children: ReactNode; tint?: boolean }) {
  return (
    <section className={p.tint ? 'bg-gold-pale/50' : ''}>
      <div className="mx-auto max-w-6xl px-4 py-14">
        {p.eyebrow && (
          <div className="text-center text-xs font-semibold tracking-[0.2em] text-gold-dark uppercase">
            {p.eyebrow}
          </div>
        )}
        {p.title && <h2 className="mt-1 mb-8 text-center text-3xl font-bold">{p.title}</h2>}
        {p.children}
      </div>
    </section>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card border-t-4 border-t-gold">
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}

function Motto() {
  return (
    <section className="bg-navy py-12 text-center">
      <div className="font-serif text-3xl text-gold-light italic">"God Is Our Strength"</div>
      <div className="mt-2 text-sm text-white/70">School Motto · WITH GOD Schools, Igando</div>
    </section>
  );
}

function CTA({ title, sub }: { title: string; sub: string }) {
  return (
    <Section>
      <div className="rounded-2xl bg-gradient-to-r from-navy to-navy-light p-10 text-center text-white">
        <h2 className="text-3xl font-bold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/80">{sub}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/apply" className="btn-gold">How to Apply</Link>
          <Link to="/contact" className="btn border border-white/40 text-white hover:bg-white/10">
            Contact Us
          </Link>
        </div>
      </div>
    </Section>
  );
}

const HERO = ['/img/hero-1.svg', '/img/hero-2.svg', '/img/hero-3.svg', '/img/hero-4.svg'];
const GALLERY = ['/img/hero-2.svg', '/img/gallery-5.svg', '/img/hero-3.svg', '/img/gallery-6.svg'];

export function Home() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % HERO.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <section className="relative overflow-hidden bg-navy">
        {HERO.map((src, k) => (
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${k === i ? 'opacity-40' : 'opacity-0'}`}
          />
        ))}
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-white md:py-32">
          <div className="text-xs font-semibold tracking-[0.2em] text-gold-light uppercase">
            Established for Excellence
          </div>
          <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-bold text-white md:text-6xl">
            Where God's grace meets academic greatness
          </h1>
          <p className="mt-4 text-gold-light italic">
            "Train up a child in the way he should go." — Proverbs 22:6
          </p>
          <p className="mt-4 max-w-xl text-white/85">
            WITH GOD Schools provides a holistic, Christ-centred education that
            prepares every student for excellence in academics, character and
            life, in the heart of Igando, Lagos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/apply" className="btn-gold">How to Apply</Link>
            <Link to="/about" className="btn border border-white/40 text-white hover:bg-white/10">
              Learn More
            </Link>
          </div>
          <div className="mt-10 flex gap-2">
            {HERO.map((_, k) => (
              <button
                key={k}
                aria-label={`Slide ${k + 1}`}
                onClick={() => setI(k)}
                className={`h-2 rounded-full transition-all ${k === i ? 'w-8 bg-gold' : 'w-2 bg-white/40'}`}
              />
            ))}
          </div>
        </div>
      </section>

      <Section eyebrow="Why Choose Us" title="A school built on purpose">
        <div className="grid gap-5 md:grid-cols-3">
          <Feature title="Academic Excellence">
            Our curriculum is designed to challenge and inspire, with dedicated
            teachers who go beyond the textbook to spark real understanding.
          </Feature>
          <Feature title="Character Development">
            We nurture the mind and the soul, building integrity, compassion
            and service in every student who walks through our gates.
          </Feature>
          <Feature title="A Nurturing Community">
            From Nursery through Secondary, every child is known by name. Small
            classes and attentive staff mean nobody is just a number.
          </Feature>
        </div>
      </Section>

      <Motto />

      <Section eyebrow="Life at Our School" title="A glimpse into our community">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {GALLERY.map((src) => (
            <img key={src} src={src} alt="" className="aspect-square w-full rounded-xl object-cover shadow" />
          ))}
        </div>
      </Section>

      <CTA
        title="Ready to join our school family?"
        sub="We'd love to welcome your child. Learn about admissions or get in touch with our team today."
      />
    </>
  );
}

export function About() {
  return (
    <>
      <Banner
        eyebrow="Our Story"
        title="About WITH GOD Schools"
        sub="A Christ-centred community devoted to raising confident, capable and compassionate young people."
      />
      <Section eyebrow="Our Mission" title="Nurturing minds, building futures">
        <div className="mx-auto max-w-3xl space-y-4 text-center leading-relaxed text-slate-600">
          <p>
            WITH GOD Schools was founded on a simple conviction: every child
            deserves an education rooted in both academic rigour and moral
            character. From Nursery through Secondary, we walk alongside each
            student and their family, building a foundation that lasts well
            beyond graduation.
          </p>
          <p>
            Our classrooms are places of real curiosity, where teachers know
            their students by name and adapt to how each child learns best.
            Excellence and compassion are not opposites. They grow together.
          </p>
        </div>
      </Section>
      <Section eyebrow="What We Stand For" title="Our core values" tint>
        <div className="grid gap-5 md:grid-cols-3">
          <Feature title="Excellence">
            We hold high academic standards and equip every student to meet
            them, from early literacy to exam preparation.
          </Feature>
          <Feature title="Faith & Character">
            Christian values are part of daily life. Honesty, kindness and
            service are taught as deliberately as reading and arithmetic.
          </Feature>
          <Feature title="Community">
            Small classes, attentive staff and close partnership with families
            mean every child is known and supported.
          </Feature>
        </div>
      </Section>
      <Motto />
      <CTA
        title="Want to see it for yourself?"
        sub="We welcome visits from prospective families. Reach out and we'll arrange a time to show you around."
      />
    </>
  );
}

export function Apply() {
  const steps = [
    ['Make an enquiry', "Call, visit or message us with your child's age and the class you're asking about."],
    ['Visit the school', "We'll arrange a time for you and your child to tour our facilities and meet our staff."],
    ['Submit documents', 'Complete the registration form and provide the documents listed below.'],
    ['Enrolment', "Once accepted, we'll confirm your child's class and share the resumption date."],
  ];
  const needs = [
    'Completed registration form (available at the school office)',
    "Child's birth certificate or age declaration",
    'Two recent passport photographs',
    'Immunisation record',
    "Previous school's report card and transfer letter (for transferring students)",
  ];
  const ages = [
    ['Nursery 1 – 2', '2 – 4 years'],
    ['KG 1 – 2', '4 – 5 years'],
    ['Primary 1 – 6', '5 – 10 years'],
    ['JSS 1 – 3', '11 – 13 years'],
    ['SSS 1 – 3', '14 – 16 years'],
  ];
  return (
    <>
      <Banner
        eyebrow="Admissions"
        title="How to Apply"
        sub="Joining WITH GOD Schools is simple. Here is everything you need to know."
      />
      <Section eyebrow="The Process" title="Four simple steps">
        <div className="grid gap-5 md:grid-cols-4">
          {steps.map(([t, d], k) => (
            <div key={t} className="card">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gold font-bold text-navy">
                {k + 1}
              </div>
              <h3 className="mb-1 font-bold">{t}</h3>
              <p className="text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section tint>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold tracking-[0.2em] text-gold-dark uppercase">Requirements</div>
            <h2 className="mb-4 text-2xl font-bold">What to bring</h2>
            <ul className="space-y-2">
              {needs.map((n) => (
                <li key={n} className="flex gap-2 text-sm">
                  <span className="text-gold-dark">✓</span>
                  {n}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold tracking-[0.2em] text-gold-dark uppercase">Class Guide</div>
            <h2 className="mb-4 text-2xl font-bold">Which class is my child?</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Typical age</th>
                  </tr>
                </thead>
                <tbody>
                  {ages.map(([c, a]) => (
                    <tr key={c}>
                      <td className="font-medium">{c}</td>
                      <td>{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Ages are a general guide. Placement also considers prior schooling and assessment.
            </p>
          </div>
        </div>
      </Section>
      <CTA title="Ready to begin?" sub="Get in touch and our admissions team will guide you through every step." />
    </>
  );
}

export function Contact() {
  return (
    <>
      <Banner eyebrow="Get in Touch" title="Contact Us" sub="We'd be glad to hear from you." />
      <Section>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="card">
            <h3 className="mb-2 font-bold">Address</h3>
            <p className="text-sm text-slate-600">9, Olowora Street, Igando, Lagos State, Nigeria</p>
            <a
              className="mt-2 inline-block text-sm font-semibold text-navy-light"
              href="https://maps.google.com/?q=9+Olowora+Street+Igando+Lagos"
              target="_blank"
              rel="noreferrer"
            >
              Get directions →
            </a>
          </div>
          <div className="card">
            <h3 className="mb-2 font-bold">Phone</h3>
            <a href={`tel:${PHONE}`} className="text-sm text-slate-600">0818 986 0086</a>
            <a
              className="mt-2 block text-sm font-semibold text-emerald-700"
              href={`https://wa.me/234${PHONE.slice(1)}`}
              target="_blank"
              rel="noreferrer"
            >
              Chat on WhatsApp →
            </a>
          </div>
          <div className="card">
            <h3 className="mb-2 font-bold">Office hours</h3>
            <p className="text-sm text-slate-600">
              Monday – Friday: 8:00am – 4:00pm
              <br />
              Saturday: 9:00am – 12:00pm (by appointment)
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="card">
            <h3 className="mb-2 font-bold">Planning a visit?</h3>
            <p className="text-sm text-slate-600">
              Prospective families are always welcome. Call or visit the school
              office to arrange a tour, ask about admissions or speak with a
              member of staff. No appointment needed for a general enquiry.
            </p>
          </div>
          <div className="card">
            <h3 className="mb-2 font-bold">Looking to apply?</h3>
            <p className="mb-3 text-sm text-slate-600">
              See our step-by-step admissions guide, requirements and class age ranges.
            </p>
            <Link to="/apply" className="btn-primary btn-sm">How to Apply →</Link>
          </div>
        </div>
      </Section>
    </>
  );
}
