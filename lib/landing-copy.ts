export type Language = 'en' | 'es';

export const copy = {
  en: {
    brand: 'Avril — Vibe Founding OS',
    nav: {
      generate: 'Generate',
      launch: 'Launch',
      supervise: 'Supervise',
      cta: 'Get Started',
    },
    hero: {
      srTitle: 'Avril — Vibe Founding OS',
      eyebrow: 'Vibe Founding OS',
      headline: 'Market signals →',
      focus: 'operable agentic companies',
      description:
        'Avril turns market signals into agentic companies you can launch and run. Generate opportunities, pick a blueprint, deploy your agent team, and supervise operations — with OpenClaw, Human.tech, and Convex under the hood.',
      cta: 'Get Started',
      ctaLucky: "I'm feeling lucky",
      techStack: [
        { name: 'OpenClaw', version: 'Ops' },
        { name: 'Human.tech', version: 'Identity' },
        { name: '3-Swarm', version: 'Guardrails' },
      ],
    },
    pillars: {
      label: 'Three pillars',
      title: 'From signal to supervised company',
      items: [
        {
          title: 'Generate',
          features: [
            'Market signal analysis',
            'Opportunity scoring',
            'Agentic company briefs',
            'Luck flow & ideation',
          ],
        },
        {
          title: 'Launch',
          features: [
            'Blueprint selection',
            'Agent team assembly',
            'OpenClaw deployment',
            'Go-to-market kickoff',
          ],
        },
        {
          title: 'Supervise',
          features: [
            'Live agent orchestration',
            '3-swarm guardrails',
            'Human.tech identity layer',
            'Operator dashboard',
          ],
        },
      ],
    },
    footerCta: {
      eyebrow: 'Available now · Launch in days, not months',
      title: 'Your next agentic company starts here.',
      description:
        'Press Get Started, roll for opportunities, pick a blueprint, and see how Avril takes you from market signal to deployable company.',
      cta: 'Get Started',
    },
    footer: {
      tagline:
        'Turn market signals into operable agentic companies. Generate, launch, and supervise with Avril.',
      groups: [
        {
          title: 'Product',
          links: [
            { label: 'Generate', href: '#pillars' },
            { label: 'Launch', href: '#pillars' },
            { label: 'Supervise', href: '#pillars' },
          ],
        },
        {
          title: 'Company',
          links: [
            { label: 'About', href: '#' },
            { label: 'Blog', href: '#' },
          ],
        },
        {
          title: 'Legal',
          links: [
            { label: 'Privacy Policy', href: '#' },
            { label: 'Terms of Service', href: '#' },
          ],
        },
      ],
      copyright: 'Avril — Vibe Founding OS. All rights reserved.',
      credit: 'Built for founders who ship agentic companies.',
    },
  },
  es: {
    brand: 'Avril — Vibe Founding OS',
    nav: {
      generate: 'Generar',
      launch: 'Lanzar',
      supervise: 'Supervisar',
      cta: 'Comenzar',
    },
    hero: {
      srTitle: 'Avril — Vibe Founding OS',
      eyebrow: 'Sistema Operativo de Vibe Founding',
      headline: 'Señales de mercado →',
      focus: 'empresas agénticas operables',
      description:
        'Avril convierte señales de mercado en empresas agénticas que puedes lanzar y operar. Genera oportunidades, elige un blueprint, despliega tu equipo de agentes y supervisa la operación — con OpenClaw, Human.tech y Convex como infraestructura.',
      cta: 'Comenzar',
      ctaLucky: 'Voy a tener suerte',
      techStack: [
        { name: 'OpenClaw', version: 'Ops' },
        { name: 'Human.tech', version: 'Identidad' },
        { name: '3-Swarm', version: 'Guardrails' },
      ],
    },
    pillars: {
      label: 'Tres pilares',
      title: 'De la señal a la empresa supervisada',
      items: [
        {
          title: 'Generar',
          features: [
            'Análisis de señales de mercado',
            'Scoring de oportunidades',
            'Briefs de empresa agéntica',
            'Flujo de suerte e ideación',
          ],
        },
        {
          title: 'Lanzar',
          features: [
            'Selección de blueprint',
            'Armado del equipo de agentes',
            'Despliegue con OpenClaw',
            'Arranque go-to-market',
          ],
        },
        {
          title: 'Supervisar',
          features: [
            'Orquestación de agentes en vivo',
            'Guardrails 3-swarm',
            'Capa de identidad Human.tech',
            'Dashboard del operador',
          ],
        },
      ],
    },
    footerCta: {
      eyebrow: 'Disponible ahora · Lanzamiento en días, no meses',
      title: 'Tu próxima empresa agéntica empieza aquí.',
      description:
        'Presiona Comenzar, genera oportunidades, elige un blueprint y ve cómo Avril te lleva de señal de mercado a empresa desplegable.',
      cta: 'Comenzar',
    },
    footer: {
      tagline:
        'Convierte señales de mercado en empresas agénticas operables. Genera, lanza y supervisa con Avril.',
      groups: [
        {
          title: 'Producto',
          links: [
            { label: 'Generar', href: '#pillars' },
            { label: 'Lanzar', href: '#pillars' },
            { label: 'Supervisar', href: '#pillars' },
          ],
        },
        {
          title: 'Compañía',
          links: [
            { label: 'Acerca de', href: '#' },
            { label: 'Blog', href: '#' },
          ],
        },
        {
          title: 'Legal',
          links: [
            { label: 'Política de privacidad', href: '#' },
            { label: 'Términos de servicio', href: '#' },
          ],
        },
      ],
      copyright: 'Avril — Vibe Founding OS. Todos los derechos reservados.',
      credit: 'Hecho para founders que ship empresas agénticas.',
    },
  },
} as const;

export type LandingCopy = (typeof copy)[Language];
