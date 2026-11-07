/* ==========================================================================
   data.js  —  EDIT THIS FILE to change your content.

   1. site      Your name, contact details and "About" facts.
   2. projects  The six full-screen physics & engineering scenes.
                Replace every "#" in `links` with a real URL when you have it.
                Links left as "#" show a small "soon" tag and do nothing.
   3. math      The Mathematics & Educational Tools list (placeholders).

   Each project's `visual` picks which animation is drawn behind it:
     bridge | wind | truss | sandbox | gravity | orbital |
     fourier | riemann | lorenz | nozzle | constellation | signal
   These are illustrative animations, not screenshots, so they stay sharp
   at any size. To add a project, copy an object and change its fields.
   ========================================================================== */
window.PF_DATA = {

  site: {
    name: 'Ivan Ly',
    email: 'your.email@example.com',                       // shown on the Contact slide
    github: 'https://github.com/your-username',
    linkedin: 'https://www.linkedin.com/in/your-username',
    school: 'Your High School',
    classOf: 'Class of 20XX',
    location: 'City, State',
    year: '2026'
  },

  projects: [
    {
      id: 'bridge-physics-simulator',
      category: 'Physics & Engineering',
      title: ['BRIDGE', 'PHYSICS', 'SIMULATOR'],
      description: 'A structural sandbox where moving loads travel through beams and joints in real time, showing how a bridge carries weight and where it is pushed or pulled hardest.',
      tags: ['Statics', 'Structures', 'Simulation'],
      visual: 'bridge',
      side: 1,          // 1 = visual on the right, -1 = visual on the left
      tone: 'dark',     // 'dark' or 'light' graphite background
      cy: '27%',        // vertical position of the text block
      links: { demo: '#', source: '#' }
    },
    {
      id: 'mini-wind-tunnel-simulator',
      category: 'Physics & Engineering',
      title: ['MINI WIND', 'TUNNEL', 'SIMULATOR'],
      description: 'A virtual test section for airflow. Change the angle of attack and watch streamlines bend around the wing, speeding up over the top as lift builds.',
      tags: ['Aerodynamics', 'Fluid flow', 'Simulation'],
      visual: 'wind',
      side: -1,
      tone: 'light',
      cy: '31%',
      links: { demo: '#', source: '#' }
    },
    {
      id: 'truss-force-analyzer',
      category: 'Physics & Engineering',
      title: ['TRUSS FORCE', 'ANALYZER'],
      description: 'Solves the force in every member of a truss, tension or compression, and checks that the whole structure stays in equilibrium.',
      tags: ['Statics', 'Linear algebra', 'Analysis'],
      visual: 'truss',
      side: 1,
      tone: 'dark',
      cy: '34%',
      links: { demo: '#', source: '#' }
    },
    {
      id: 'physics-sandbox',
      category: 'Physics & Engineering',
      title: ['PHYSICS', 'SANDBOX'],
      description: 'An open-ended playground for gravity, collisions and momentum, with a cursor that pulls bodies in like a small planet.',
      tags: ['Mechanics', 'Collisions', 'Interactive'],
      visual: 'sandbox',
      side: -1,
      tone: 'light',
      cy: '28%',
      links: { demo: '#', source: '#' }
    },
    {
      id: 'planetary-gravity-explorer',
      category: 'Physics & Engineering',
      title: ['PLANETARY', 'GRAVITY', 'EXPLORER'],
      description: 'Compare surface gravity and escape velocity across the planets, and see how mass bends the space around it.',
      tags: ['Gravitation', 'Astronomy', 'Data'],
      visual: 'gravity',
      side: 1,
      tone: 'dark',
      cy: '30%',
      links: { demo: '#', source: '#' }
    },
    {
      id: 'orbital-mechanics-simulator',
      category: 'Physics & Engineering',
      title: ['ORBITAL', 'MECHANICS', 'SIMULATOR'],
      description: 'How spacecraft actually move: Kepler\u2019s laws, orbit transfers and the burns that change them, simulated in real time.',
      tags: ['Aerospace', 'Orbits', 'Simulation'],
      visual: 'orbital',
      side: -1,
      tone: 'light',
      cy: '27%',
      links: { demo: '#', source: '#' }
    }
  ],

  /* Mathematics & Educational Tools.
     These three are placeholders: replace title / description / links, and
     add more objects to the list as you finish more tools. */
  math: [
    {
      title: 'Math tool 01',
      description: 'Placeholder. Describe your first mathematics or educational tool here: what it teaches and who it is for.',
      visual: 'fourier',
      links: { demo: '#', source: '#' }
    },
    {
      title: 'Math tool 02',
      description: 'Placeholder. Describe your second tool here. Keep it to one or two sentences.',
      visual: 'riemann',
      links: { demo: '#', source: '#' }
    },
    {
      title: 'Math tool 03',
      description: 'Placeholder. Describe your third tool here, and add more entries below as you build them.',
      visual: 'lorenz',
      links: { demo: '#', source: '#' }
    }
  ]
};
