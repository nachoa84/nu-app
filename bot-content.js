(() => {
  // Cada tema o bloque puede declarar opcionalmente `country` o `countries`.
  // El Bot usa ese dato para priorizar/buscar mercados, nunca para limitar
  // el acceso según el país guardado en el perfil del usuario.
  window.BotContent = [
    {
      id: "comisiones",
      title: "Comisiones",
      keywords: [
        "comisiones",
        "comision",
        "cuanto cobro",
        "cuanto gano",
        "ganancias",
        "como cobro"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Para cobrar tus comisiones necesitás tener tu cuenta y documentación en regla. Además, desde Stela podés consultar tus comisiones semanales y mensuales."
        },
        {
          type: "document",
          title: "Comisiones · guía rápida",
          description: "Un paso a paso base para ubicarte.",
          sections: [
            {
              title: "1. Cuenta y documentación",
              body:
                "Revisá que tu cuenta y documentación estén en regla antes de comenzar a controlar tus comisiones."
            },
            {
              title: "2. Consultá Stela",
              body:
                "Stela es la herramienta de gestión donde podés acceder a tus comisiones semanales y mensuales."
            },
            {
              title: "3. Seguí con el recurso correcto",
              body:
                "Escribí “Stela” en el Bot para abrir los links de descarga y el tutorial que ya usamos dentro de la rutina."
            }
          ]
        },
        {
          type: "link",
          title: "Stela · Google Play",
          description: "Descargar la app en Android.",
          url: "https://mc.ht/s/XFs7VKt",
          actionLabel: "Abrir enlace"
        },
        {
          type: "link",
          title: "Stela · App Store",
          description: "Descargar la app en iPhone.",
          url: "https://mc.ht/s/ETQAOPD",
          actionLabel: "Abrir enlace"
        }
      ]
    },

    {
      id: "stela",
      title: "Stela",
      keywords: [
        "stela",
        "app stela",
        "descargar stela",
        "link stela",
        "links stela"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Stela es la app de gestión del negocio. Te sirve para generar links, conocer consumos de clientes, consultar comisiones y planificar tu crecimiento."
        },
        {
          type: "link",
          title: "Descargar Stela · Android",
          description: "Google Play",
          url: "https://mc.ht/s/XFs7VKt",
          actionLabel: "Descargar"
        },
        {
          type: "link",
          title: "Descargar Stela · iPhone",
          description: "App Store",
          url: "https://mc.ht/s/ETQAOPD",
          actionLabel: "Descargar"
        },
        {
          type: "media",
          mediaType: "video",
          src: "assets/D02_03_VIDEO.mp4",
          title: "Cómo generar un link en Stela",
          description: "Tutorial de la rutina · Día 2",
          shareable: false,
          favorite: false
        }
      ]
    },

    {
      id: "lista-contactos",
      title: "Lista de contactos",
      keywords: [
        "lista de contactos",
        "lista contactos",
        "contactos",
        "potenciales clientes",
        "a quien contactar",
        "a quien le escribo"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Armá una lista de potenciales consumidores de Collagen+ y después bloqueá un momento de tu agenda para iniciar conversaciones personalizadas."
        },
        {
          type: "document",
          title: "Cómo armar tu lista de contactos",
          description: "Guía práctica basada en el Día 3.",
          sections: [
            {
              title: "Perfiles para sumar",
              body:
                "Personas que cuidan su piel, van al spa, entrenan, hacen deportes, tienen piel reseca, uñas débiles, problemas con su cabello o quieren envejecer de la mejor manera."
            },
            {
              title: "También podés pensar en",
              body:
                "Personas que recientemente fueron madres, que hablan del paso de los años o que muestran interés por bienestar, piel, pelo, uñas, articulaciones o huesos."
            },
            {
              title: "Abrí la conversación",
              body:
                "Podés comenzar contando que probaste un colágeno bebible, que te dio buenos resultados y preguntando: “¿Ya consumís colágeno?”"
            }
          ]
        },
        {
          type: "link",
          title: "Tips para tu lista de contactos",
          description: "Video de Micaela Barreneche.",
          url: "https://mc.ht/s/50OUUkt",
          actionLabel: "Ver video",
          resourceKind: "video"
        }
      ]
    },

    {
      id: "asesorar-collagen",
      title: "Asesorar clientes de colágeno",
      keywords: [
        "asesorar colageno",
        "asesorar clientes",
        "cliente consume colageno",
        "clientes que consumen colageno",
        "como asesorar",
        "asesoria collagen"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Para asesorar mejor a alguien que ya consume colágeno, usá la capacitación de Vero Ruchtein sobre ventajas competitivas de Collagen+."
        },
        {
          type: "link",
          title: "Cómo asesorar clientes que ya consumen colágeno",
          description: "Capacitación de Vero Ruchtein · Día 6",
          url: "https://mc.ht/s/dPkVEjM",
          actionLabel: "Ver capacitación",
          resourceKind: "video"
        },
        {
          type: "media",
          mediaType: "image",
          src: "assets/D06_03_IMAGEN.jpg",
          title: "Material de apoyo Collagen+",
          description: "Imagen de la rutina · Día 6",
          shareable: true,
          favorite: true
        }
      ]
    },

    {
      id: "contenido-redes",
      title: "Contenido para redes",
      keywords: [
        "contenido para redes",
        "que publico",
        "que publicar",
        "contenido redes",
        "redes sociales",
        "estados whatsapp",
        "historias"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Para captar clientes en redes: mostrátelo consumiendo Collagen+, compartí información útil, testimonios y terminá siempre con un llamado a la acción."
        },
        {
          type: "document",
          title: "Checklist rápido para publicar",
          description: "Una guía simple para no quedarte en blanco.",
          sections: [
            {
              title: "Mostrá el hábito",
              body:
                "Hacé videos preparando Collagen+ y compartí tu hábito de consumo."
            },
            {
              title: "Educá",
              body:
                "Compartí información sobre la importancia de suplementarse con colágeno y el diferencial de Collagen+."
            },
            {
              title: "Sumá prueba social",
              body:
                "Compartí testimonios de personas que consumen el producto."
            },
            {
              title: "Cerrá con una acción",
              body:
                "Invitá a pedir más información o a consultar por las promociones vigentes."
            }
          ]
        },
        {
          type: "media",
          mediaType: "image",
          src: "assets/D05_02_IMAGEN.jpg",
          title: "Ejemplo de contenido para hoy",
          description: "Material de la rutina · Día 5",
          shareable: true,
          favorite: true
        }
      ]
    },

    {
      id: "collagen-info",
      title: "Aprender sobre Collagen+",
      keywords: [
        "collagen+",
        "collagen",
        "colageno",
        "aprender collagen",
        "informacion collagen",
        "info colageno",
        "que es collagen"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Acá tenés el recurso educativo que usamos al comenzar la rutina para aprender sobre Collagen+ y después un material visual que podés abrir desde la misma app."
        },
        {
          type: "link",
          title: "Aprendé sobre Collagen+",
          description: "Video educativo · Día 1",
          url: "https://mc.ht/s/URLFxbD",
          actionLabel: "Ver video",
          resourceKind: "video"
        },
        {
          type: "media",
          mediaType: "image",
          src: "assets/D01_05_IMAGEN.jpg",
          title: "Material Collagen+",
          description: "Imagen de la rutina · Día 1",
          shareable: true,
          favorite: true
        }
      ]
    },

    {
      id: "mapa-suenos",
      title: "Mapa de sueños",
      keywords: [
        "mapa de sueños",
        "mapa sueños",
        "mapa de suenos",
        "mapa suenos",
        "vision board",
        "tablero de sueños",
        "tablero de suenos"
      ],
      blocks: [
        {
          type: "text",
          content:
            "El mapa de sueños te ayuda a poner en imágenes y palabras aquello que querés construir. Te dejo la capacitación de Skool para hacerlo paso a paso."
        },
        {
          type: "link",
          title: "Mapa de sueños",
          description: "Skool · Plataforma de capacitaciones",
          url: "https://www.skool.com/teamelites/classroom/eb548f79?md=9f7239c84c144be89c10794e08bf3636",
          actionLabel: "Ver capacitación",
          resourceKind: "video"
        }
      ]
    },

    {
      id: "presentaciones",
      title: "Presentaciones",
      keywords: [
        "presentaciones",
        "presentacion",
        "presentar negocio",
        "presentar producto"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Acá vamos a centralizar las presentaciones de negocio y producto, ordenadas por objetivo y duración. El formato ya quedó preparado para sumar enlaces, documentos y videos cuando carguemos esos recursos."
        }
      ]
    },

    {
      id: "primeros-pasos",
      title: "Primeros pasos",
      keywords: [
        "primeros pasos",
        "como iniciar",
        "nuevo socio",
        "recien empiezo"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Acá vamos a guiar a un nuevo socio con una secuencia de primeros pasos, accesos, capacitaciones y acciones iniciales. La estructura del Bot ya permite sumar la guía completa cuando la carguemos."
        }
      ]
    },

    {
      id: "productos",
      title: "Productos",
      keywords: [
        "productos",
        "producto",
        "info producto",
        "informacion producto"
      ],
      blocks: [
        {
          type: "text",
          content:
            "Acá vamos a centralizar información de producto, preguntas frecuentes, contenido de venta y material para compartir. Por ahora ya podés escribir “Collagen+” para ver un ejemplo completo con texto, video e imagen."
        }
      ]
    }
  ];
})();
