export type Language = 'en' | 'es';

export const copy = {
  en: {
    brand: 'Avril',
    nav: {
      product: 'Product',
      opportunities: 'Opportunities',
      blueprints: 'Blueprints',
      pricing: 'Pricing',
      signIn: 'Sign in',
      signingIn: 'Signing in…',
    },
    hero: {
      srTitle: 'Avril — Vibe Founding OS',
      eyebrow: 'Vibe Founding OS',
      title: 'From market signal to AI-operated company.',
      subtitle:
        'Avril finds market-backed opportunities, turns them into business blueprints, and helps you deploy human-supervised agents to operate the company.',
      ctaPrimary: 'Generate opportunities',
      ctaSecondary: 'Build from my idea',
      techStack: [
        { name: 'OpenClaw', version: 'Live' },
        { name: 'Human.tech', version: 'Identity' },
        { name: '3-Swarm', version: 'Guardrails' },
      ],
    },
    pillars: {
      label: 'Three pillars',
      title: 'Opportunity Engine → Blueprint → Managed Deploy',
      items: [
        {
          title: 'Opportunity Engine',
          description: 'Detect market signals and generate business opportunities worth exploring.',
          features: [
            'Market signal analysis',
            'Opportunity scoring',
            '3 blueprint previews',
            'Founder fit',
          ],
        },
        {
          title: 'Business Blueprint',
          description:
            'Convert an idea or opportunity into a clear offer, audience, workflows, agents, tools, and launch plan.',
          features: ['Offer and customer', 'Agent roles', 'Workflows and tools', 'Risks and costs'],
        },
        {
          title: 'Managed Deploy',
          description:
            'Launch AI-operated workflows with human approval, monitoring, and an operator dashboard.',
          features: [
            'Human-supervised agents',
            'Approval gates',
            'Operator dashboard',
            'Managed cloud',
          ],
        },
      ],
    },
    pricing: {
      label: 'Pricing',
      title: 'Preview first. Deploy when ready.',
      subtitle:
        'Start with a free opportunity preview. Pay when you want the full blueprint or a managed deploy.',
      plans: [
        { name: 'Preview', price: 'Free', interval: 'preview', description: 'Opportunity cards and blueprint preview.' },
        { name: 'Blueprint', price: '$99', interval: 'one-time', description: 'Full business blueprint export.' },
        { name: 'Managed Launch', price: '$999', interval: 'setup', description: 'Human-supervised agent deployment.' },
        { name: 'Operator', price: '$199', interval: '/ month', description: 'Ongoing operator dashboard access.' },
        { name: 'Studio', price: 'Custom', interval: 'contact', description: 'Multi-company studio workspace.' },
      ],
    },
    footerCta: {
      eyebrow: 'Vibe Founding OS',
      title: 'From market signal to AI-operated company.',
      description:
        'Generate opportunities, choose a blueprint, and launch with human-supervised agents and approval gates.',
      ctaPrimary: 'Generate opportunities',
      ctaSecondary: 'Build from my idea',
    },
    footer: {
      tagline:
        'Avril is a Vibe Founding OS for building AI-operated companies with human-supervised agents.',
      groups: [
        {
          title: 'Product',
          links: [
            { label: 'Opportunity Engine', href: '#pillars' },
            { label: 'Business Blueprint', href: '#pillars' },
            { label: 'Managed Deploy', href: '#pillars' },
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
    },
    flow: {
      backHome: 'Back to home',
      flowLabel: 'Avril · Vibe Founding OS',
      start: {
        title: 'Choose your starting point.',
        subtitle: 'Bring your own idea or let Avril generate market-backed opportunities.',
        cardA: {
          title: 'Generate opportunities',
          description: 'No idea yet? Avril generates 3 opportunity blueprints from market signals.',
        },
        cardB: {
          title: 'Build from my idea',
          description:
            'Already have an idea? Avril turns it into a founder brief and deploy-ready blueprint.',
        },
      },
      idea: {
        eyebrow: 'Founder brief',
        title: 'Tell Avril about your idea.',
        subtitle: 'We turn your input into a founder brief and a deploy-ready business blueprint.',
        fields: {
          companyName: 'Company name',
          rawIdea: 'Your idea',
          targetCustomer: 'Ideal customer',
          problem: 'Problem you solve',
        },
        placeholders: {
          companyName: 'e.g. Signal Desk',
          rawIdea: 'Describe the business you want to build…',
          targetCustomer: 'Who is this for?',
          problem: 'What pain point are you addressing?',
        },
        cta: 'Create founder brief',
        loading: ['Structuring your founder brief…', 'Mapping offer and audience…', 'Assembling deploy-ready blueprint…'],
      },
      opportunity: {
        eyebrow: 'Opportunity generation',
        title: 'Generate your first opportunities.',
        subtitle:
          'Avril generates 3 market-backed opportunity blueprints so you can choose the one with the clearest path to launch.',
        cta: 'Generate opportunities',
        loading: [
          'Analyzing market signals…',
          'Detecting business opportunities…',
          'Assembling deploy-ready blueprints…',
        ],
        resultsEyebrow: '3 opportunities ready',
        resultsTitle: 'Choose your company',
        resultsSubtitle: 'Each card is a market-backed blueprint. Select one to review the full business blueprint.',
      },
      cards: {
        idealCustomer: 'Ideal customer',
        problem: 'Problem',
        initialOffer: 'Initial offer',
        requiredAgents: 'Required agents',
        monetizationSpeed: 'Monetization speed',
        difficulty: 'Difficulty',
        opportunityScore: 'Opportunity score',
        choose: 'Choose this company',
        difficultyLow: 'Low',
        difficultyMedium: 'Medium',
        difficultyHigh: 'High',
      },
      blueprint: {
        eyebrow: 'Business blueprint',
        offer: 'Offer',
        idealCustomer: 'Ideal customer',
        launchSteps: 'First 3 launch steps',
        includedAgents: 'Included agents',
        risks: 'Risks and assumptions',
        deployCost: 'Estimated deploy cost',
        cta: 'Deploy my company',
        back: 'Back to opportunities',
        readyNote: 'Blueprint ready for managed deploy',
      },
      signIn: {
        title: 'Sign in to deploy',
        subtitle:
          'Connect your wallet and sign a message (SIWE) to save this blueprint to your account before payment.',
        queuedTitle: '{company} queued for deploy',
        cta: 'Sign in with wallet',
        connecting: 'Connecting…',
        linking: 'Linking {company} to your wallet…',
        walletNote: 'Human.tech WaaP · wallet signature secures your session',
        restartOpportunity: 'Generate new opportunities',
        restartIdea: 'Start a new idea',
      },
      deploy: {
        eyebrow: 'Managed deploy',
        title: 'Launch',
        subtitle:
          'Choose a deployment plan to activate your agent team. Payment is mocked until Stripe is connected.',
        stripeSubtitle:
          'Choose a deployment plan to activate your agent team. You will complete payment in Stripe test mode.',
        cta: 'Confirm & launch',
        processing: 'Processing…',
        mockNote: 'Mock checkout · Stripe not connected',
        stripeNote: 'Stripe test mode · card 4242 4242 4242 4242',
        popular: 'Recommended',
        plans: {
          blueprint: {
            description: 'Full business blueprint with offer, agents, workflows, and launch plan.',
            features: ['Complete blueprint export', 'Agent role map', 'Risk and cost estimate', 'Email support'],
          },
          'managed-launch': {
            description: 'Human-supervised agent deployment with approval gates and managed cloud.',
            features: ['Managed deploy', 'Human-supervised agents', 'Approval gates', 'Operator onboarding'],
          },
          operator: {
            description: 'Ongoing operator dashboard, monitoring, and agent team supervision.',
            features: ['Operator dashboard', 'Health monitoring', 'Pending decisions inbox', 'Skill suggestions'],
          },
        },
      },
      dashboard: {
        title: 'Your AI-operated company is live.',
        subtitle:
          'Track active agents, pending decisions, health score, revenue signals, and suggested skills.',
        cta: 'Open operator dashboard',
        restart: 'Start another company',
        stats: {
          agents: 'Active agents',
          approvals: 'Pending approvals',
          health: 'Health score',
          revenue: 'Revenue signals',
        },
      },
      creating: {
        title: 'Your AI-operated company is being created.',
        subtitle:
          'You will be able to track active agents, pending decisions, health score, revenue signals, and suggested skills.',
        phases: [
          'Loading business blueprint…',
          'Provisioning human-supervised agents…',
          'Configuring approval gates…',
          'Deploying to managed cloud…',
          'Opening operator dashboard…',
        ],
        nodes: {
          blueprint: 'Blueprint',
          agents: 'Agents',
          gates: 'Gates',
          cloud: 'Cloud',
          dashboard: 'Dashboard',
        },
      },
    },
  },
  es: {
    brand: 'Avril',
    nav: {
      product: 'Producto',
      opportunities: 'Oportunidades',
      blueprints: 'Blueprints',
      pricing: 'Precios',
      signIn: 'Iniciar sesión',
      signingIn: 'Iniciando sesión…',
    },
    hero: {
      srTitle: 'Avril — Vibe Founding OS',
      eyebrow: 'Vibe Founding OS',
      title: 'De señal de mercado a empresa operada por IA.',
      subtitle:
        'Avril encuentra oportunidades respaldadas por señales de mercado, las convierte en blueprints de negocio y te ayuda a desplegar agentes supervisados por humanos.',
      ctaPrimary: 'Generar oportunidades',
      ctaSecondary: 'Construir desde mi idea',
      techStack: [
        { name: 'OpenClaw', version: 'Live' },
        { name: 'Human.tech', version: 'Identity' },
        { name: '3-Swarm', version: 'Guardrails' },
      ],
    },
    pillars: {
      label: 'Tres pilares',
      title: 'Motor de oportunidades → Blueprint → Deploy gestionado',
      items: [
        {
          title: 'Motor de oportunidades',
          description: 'Detecta señales de mercado y genera oportunidades de negocio accionables.',
          features: [
            'Análisis de señales',
            'Score de oportunidad',
            '3 previews de blueprint',
            'Fit con el founder',
          ],
        },
        {
          title: 'Blueprint de negocio',
          description:
            'Convierte una idea u oportunidad en oferta, audiencia, workflows, agentes, herramientas y plan de lanzamiento.',
          features: ['Oferta y cliente', 'Roles de agentes', 'Workflows y herramientas', 'Riesgos y costos'],
        },
        {
          title: 'Deploy gestionado',
          description: 'Lanza workflows operados por IA con aprobación humana, monitoreo y dashboard.',
          features: [
            'Agentes supervisados',
            'Approval gates',
            'Dashboard operativo',
            'Cloud gestionado',
          ],
        },
      ],
    },
    pricing: {
      label: 'Precios',
      title: 'Vista previa gratis. Deploy cuando estés listo.',
      subtitle:
        'Empieza con una vista previa gratuita. Paga cuando quieras el blueprint completo o un deploy gestionado.',
      plans: [
        { name: 'Preview', price: 'Gratis', interval: 'vista previa', description: 'Tarjetas de oportunidad y preview de blueprint.' },
        { name: 'Blueprint', price: '$99', interval: 'pago único', description: 'Export del blueprint de negocio completo.' },
        { name: 'Managed Launch', price: '$999', interval: 'setup', description: 'Deploy de agentes supervisados por humanos.' },
        { name: 'Operator', price: '$199', interval: '/ mes', description: 'Acceso continuo al dashboard operativo.' },
        { name: 'Studio', price: 'Custom', interval: 'contacto', description: 'Workspace studio multi-empresa.' },
      ],
    },
    footerCta: {
      eyebrow: 'Vibe Founding OS',
      title: 'De señal de mercado a empresa operada por IA.',
      description:
        'Genera oportunidades, elige un blueprint y lanza con agentes supervisados por humanos y approval gates.',
      ctaPrimary: 'Generar oportunidades',
      ctaSecondary: 'Construir desde mi idea',
    },
    footer: {
      tagline:
        'Avril es un Vibe Founding OS para crear empresas operadas por IA con agentes supervisados por humanos.',
      groups: [
        {
          title: 'Producto',
          links: [
            { label: 'Motor de oportunidades', href: '#pillars' },
            { label: 'Blueprint de negocio', href: '#pillars' },
            { label: 'Deploy gestionado', href: '#pillars' },
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
    },
    flow: {
      backHome: 'Volver al inicio',
      flowLabel: 'Avril · Vibe Founding OS',
      start: {
        title: 'Elige tu punto de partida.',
        subtitle: 'Trae tu propia idea o deja que Avril genere oportunidades respaldadas por señales de mercado.',
        cardA: {
          title: 'Generar oportunidades',
          description: '¿Sin idea clara? Avril genera 3 blueprints de oportunidad desde señales de mercado.',
        },
        cardB: {
          title: 'Construir desde mi idea',
          description: '¿Ya tienes una idea? Avril la convierte en founder brief y blueprint listo para deploy.',
        },
      },
      idea: {
        eyebrow: 'Founder brief',
        title: 'Cuéntale a Avril tu idea.',
        subtitle: 'Convertimos tu input en founder brief y blueprint de negocio listo para deploy.',
        fields: {
          companyName: 'Nombre de la empresa',
          rawIdea: 'Tu idea',
          targetCustomer: 'Cliente ideal',
          problem: 'Problema que resuelves',
        },
        placeholders: {
          companyName: 'ej. Signal Desk',
          rawIdea: 'Describe el negocio que quieres construir…',
          targetCustomer: '¿Para quién es?',
          problem: '¿Qué dolor estás resolviendo?',
        },
        cta: 'Crear founder brief',
        loading: [
          'Estructurando tu founder brief…',
          'Mapeando oferta y audiencia…',
          'Armando blueprint listo para deploy…',
        ],
      },
      opportunity: {
        eyebrow: 'Generación de oportunidades',
        title: 'Genera tus primeras oportunidades.',
        subtitle:
          'Avril genera 3 blueprints de oportunidad respaldados por señales de mercado para que elijas el negocio con mejor camino de lanzamiento.',
        cta: 'Generar oportunidades',
        loading: [
          'Analizando señales de mercado…',
          'Detectando oportunidades de negocio…',
          'Armando blueprints listos para deploy…',
        ],
        resultsEyebrow: '3 oportunidades listas',
        resultsTitle: 'Elige tu empresa',
        resultsSubtitle:
          'Cada tarjeta es un blueprint respaldado por mercado. Elige una para revisar el blueprint completo.',
      },
      cards: {
        idealCustomer: 'Cliente ideal',
        problem: 'Problema',
        initialOffer: 'Oferta inicial',
        requiredAgents: 'Agentes necesarios',
        monetizationSpeed: 'Velocidad de monetización',
        difficulty: 'Dificultad',
        opportunityScore: 'Score de oportunidad',
        choose: 'Elegir esta empresa',
        difficultyLow: 'Baja',
        difficultyMedium: 'Media',
        difficultyHigh: 'Alta',
      },
      blueprint: {
        eyebrow: 'Blueprint de negocio',
        offer: 'Oferta',
        idealCustomer: 'Cliente ideal',
        launchSteps: 'Primeros 3 pasos de lanzamiento',
        includedAgents: 'Agentes incluidos',
        risks: 'Riesgos y supuestos',
        deployCost: 'Costo estimado de deploy',
        cta: 'Desplegar mi empresa',
        back: 'Volver a oportunidades',
        readyNote: 'Blueprint listo para deploy gestionado',
      },
      signIn: {
        title: 'Inicia sesión para desplegar',
        subtitle:
          'Conecta tu wallet y firma un mensaje (SIWE) para guardar este blueprint en tu cuenta antes del pago.',
        queuedTitle: '{company} en cola para deploy',
        cta: 'Iniciar sesión con wallet',
        connecting: 'Conectando…',
        linking: 'Vinculando {company} a tu wallet…',
        walletNote: 'Human.tech WaaP · la firma de wallet asegura tu sesión',
        restartOpportunity: 'Generar nuevas oportunidades',
        restartIdea: 'Iniciar una nueva idea',
      },
      deploy: {
        eyebrow: 'Deploy gestionado',
        title: 'Lanzar',
        subtitle:
          'Elige un plan de despliegue para activar tu equipo de agentes. El pago está simulado hasta conectar Stripe.',
        stripeSubtitle:
          'Elige un plan de despliegue para activar tu equipo de agentes. Completarás el pago en modo test de Stripe.',
        cta: 'Confirmar y lanzar',
        processing: 'Procesando…',
        mockNote: 'Checkout simulado · Stripe sin conectar',
        stripeNote: 'Modo test Stripe · tarjeta 4242 4242 4242 4242',
        popular: 'Recomendado',
        plans: {
          blueprint: {
            description: 'Blueprint de negocio completo con oferta, agentes, workflows y plan de lanzamiento.',
            features: ['Export del blueprint completo', 'Mapa de roles de agentes', 'Estimación de riesgos y costos', 'Soporte por email'],
          },
          'managed-launch': {
            description: 'Deploy de agentes supervisados por humanos con approval gates y cloud gestionado.',
            features: ['Deploy gestionado', 'Agentes supervisados', 'Approval gates', 'Onboarding operativo'],
          },
          operator: {
            description: 'Dashboard operativo continuo, monitoreo y supervisión del equipo de agentes.',
            features: ['Dashboard operativo', 'Monitoreo de salud', 'Bandeja de decisiones pendientes', 'Skills sugeridas'],
          },
        },
      },
      dashboard: {
        title: 'Tu empresa operada por IA está activa.',
        subtitle:
          'Revisa agentes activos, decisiones pendientes, health score, señales de ingreso y skills sugeridas.',
        cta: 'Abrir dashboard operativo',
        restart: 'Iniciar otra empresa',
        stats: {
          agents: 'Agentes activos',
          approvals: 'Decisiones pendientes',
          health: 'Health score',
          revenue: 'Señales de ingreso',
        },
      },
      creating: {
        title: 'Tu empresa operada por IA se está creando.',
        subtitle:
          'Podrás revisar agentes activos, decisiones pendientes, health score, señales de ingreso y skills sugeridas.',
        phases: [
          'Cargando blueprint de negocio…',
          'Provisionando agentes supervisados…',
          'Configurando approval gates…',
          'Desplegando en cloud gestionado…',
          'Abriendo dashboard operativo…',
        ],
        nodes: {
          blueprint: 'Blueprint',
          agents: 'Agentes',
          gates: 'Gates',
          cloud: 'Cloud',
          dashboard: 'Dashboard',
        },
      },
    },
  },
} as const;

export type LandingCopy = (typeof copy)[Language];
