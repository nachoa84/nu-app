(() => {
  // Biblioteca activa del Bot · migrada desde THE NEW BOT de ManyChat.
  // Los comandos visibles conservan los nombres conocidos, sin necesitar el punto inicial.
  window.BotContent = [
  {
    "id": "loi",
    "title": "LOI",
    "command": "loi",
    "aliases": [
      "carta loi",
      "enviar loi",
      "hacer loi"
    ],
    "phrases": [
      "como hago la loi",
      "como hacer la loi",
      "necesito hacer la loi",
      "quiero enviar la loi",
      "donde esta la loi"
    ],
    "keywords": [
      "representante de marca",
      "carta loi",
      "oficina virtual"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Perfecto!\nEnviar la carta LOI, es la forma de avisarle a Nu Skin que inicias el camino para convertirte en Representante de Marca, es un paso muy simple pero obligatorio que se hace desde la oficina virtual.\nDesde que dispositivo prefieres hacerlo:\n\nDesde el MOVIL\n\nDesde el PC"
      },
      {
        "type": "link",
        "title": "LOI desde el móvil",
        "url": "https://youtu.be/cH_ngeghtHs",
        "actionLabel": "Abrir",
        "description": "Video tutorial",
        "resourceKind": "video"
      },
      {
        "type": "link",
        "title": "LOI desde PC",
        "url": "https://youtu.be/3wQ6hRFWzUs",
        "actionLabel": "Abrir",
        "description": "Video tutorial",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "loi"
  },
  {
    "id": "tramites",
    "title": "Trámites",
    "command": "tramites",
    "aliases": [
      "tramite",
      "tramites cobrar",
      "tramite cobrar",
      "cobrar comisiones",
      "cobro de comisiones"
    ],
    "phrases": [
      "como cobro mis comisiones",
      "como cobrar mis comisiones",
      "que tramites necesito para cobrar",
      "necesito cobrar comisiones"
    ],
    "keywords": [
      "comisiones",
      "documentacion",
      "documentos",
      "facturar"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Tengo los trámites para cobrar comisiones organizados por país. Escribí el país junto al comando, por ejemplo: “tramites argentina”."
      },
      {
        "type": "document",
        "title": "Trámites disponibles",
        "sections": [
          {
            "title": "Argentina",
            "body": "Escribí: tramites argentina"
          },
          {
            "title": "España",
            "body": "Escribí: tramites españa"
          },
          {
            "title": "Italia",
            "body": "Escribí: tramites italia"
          },
          {
            "title": "México",
            "body": "Escribí: tramites mexico"
          },
          {
            "title": "Perú",
            "body": "Escribí: tramites peru"
          }
        ],
        "description": "Elegí el mercado que necesitás."
      }
    ],
    "sourceFlow": "tramites cobrar"
  },
  {
    "id": "tramites-argentina",
    "title": "Trámites · Argentina",
    "command": "tramites argentina",
    "commands": [
      "tramite argentina"
    ],
    "aliases": [
      "tramites Argentina",
      "tramite Argentina",
      "cobrar comisiones Argentina",
      "cobro comisiones Argentina"
    ],
    "phrases": [
      "como cobro en Argentina",
      "como cobrar comisiones en Argentina",
      "tramites para cobrar en Argentina",
      "que necesito para cobrar en Argentina"
    ],
    "keywords": [
      "tramites",
      "comisiones",
      "documentacion",
      "factura",
      "monotributo",
      "ARCA",
      "cuestionario",
      "Argentina"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Para habilitar el cobro de comisiones en Argentina, completá estas cuatro etapas. Necesitás tener monotributo activo y una cuenta bancaria a tu nombre. No se admiten cuentas digitales como Mercado Pago."
      },
      {
        "type": "document",
        "kicker": "ETAPA 1 DE 4",
        "title": "Acuerdo de Afiliado de Marca",
        "description": "Completá el formulario y adjuntá tu constancia de inscripción en ARCA.",
        "sections": [
          {
            "title": "Requisitos",
            "body": "Tenés que contar con monotributo activo y una cuenta bancaria a tu nombre. Las cuentas digitales, como Mercado Pago, no se admiten para el pago de comisiones."
          },
          {
            "title": "Documentación",
            "body": "Completá el formulario de afiliado de marca, descargá tu constancia de inscripción en ARCA y adjuntala dentro del mismo formulario."
          }
        ],
        "actions": [
          {
            "title": "Completar formulario",
            "description": "Acuerdo de Afiliado de Marca",
            "url": "https://nuskin.jotform.com/220546195814054"
          },
          {
            "title": "Obtener constancia en ARCA",
            "description": "Constancia de inscripción",
            "url": "https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do"
          }
        ]
      },
      {
        "type": "document",
        "kicker": "ETAPA 2 DE 4",
        "title": "Oficina Virtual",
        "description": "Realizá la capacitación obligatoria de Nu Skin.",
        "sections": [
          {
            "title": "Conceptos Básicos de las Políticas",
            "body": "Ingresá a la Oficina Virtual de Nu Skin, abrí la sección Entrenamientos y completá el curso “Conceptos Básicos de las Políticas”. El curso incluye un video y un cuestionario obligatorio."
          }
        ],
        "actions": [
          {
            "title": "Ingresar a la Oficina Virtual",
            "description": "Abrir capacitaciones de Nu Skin",
            "url": "https://www.nuskin.com/vgclient/#/trainings"
          }
        ]
      },
      {
        "type": "document",
        "kicker": "ETAPA 3 DE 4",
        "title": "Pon a prueba tus conocimientos",
        "description": "Cuestionario obligatorio para habilitar el cobro de comisiones.",
        "sections": [
          {
            "title": "Requisito de Nu Skin",
            "body": "Después de realizar la capacitación, Nu Skin te solicitará completar y aprobar el cuestionario “Pon a prueba tus conocimientos”. Este requisito es necesario para quedar habilitado para cobrar tus comisiones."
          },
          {
            "title": "Guía de respuestas",
            "body": "Revisá las tres capturas como guía para responder correctamente el cuestionario."
          }
        ],
        "galleryTitle": "Ver cuestionario y respuestas",
        "items": [
          {
            "src": "/api/bot-assets/09875bdd9145c1b6ffa9ad97852f6ce8aa27b5e0726d2a3b1527210138684e59.png",
            "label": "Cuestionario · Parte 1",
            "mediaType": "image"
          },
          {
            "src": "/api/bot-assets/8ea6987080e225bf4380bd791c3456e927806830678fb24b2ef5b67dcadd778d.jpeg",
            "label": "Cuestionario · Parte 2",
            "mediaType": "image"
          },
          {
            "src": "/api/bot-assets/556a43ff951dc5e311edca673d87336ff6a6b5527f47d0cecbe6760619e59669.jpeg",
            "label": "Cuestionario · Parte 3",
            "mediaType": "image"
          }
        ]
      },
      {
        "type": "document",
        "kicker": "ETAPA 4 DE 4",
        "title": "Cómo emitir y enviar tu factura",
        "description": "Facturá cuando hayas completado las etapas anteriores.",
        "sections": [
          {
            "title": "Prepará los datos",
            "body": "Consultá tu comisión en Stela, dentro de Documentos, Impuestos o Tax Documents. Allí encontrarás la descripción y el importe que necesitás para confeccionar la factura."
          },
          {
            "title": "Emití la factura",
            "body": "Ingresá a ARCA con clave fiscal, abrí Comprobantes en línea y generá una factura C por servicios.\n\nCUIT de Nu Skin: 30-69083303-0\nCondición frente al IVA: Responsable inscripto\nCondición de venta: contado\n\nUsá la descripción indicada en Tax Documents y colocá el importe total de tu comisión."
          },
          {
            "title": "Enviá la factura",
            "body": "Descargá la factura en PDF y enviala a facturas@nuskin.com. Indicá tu número de ID AR… en el asunto del correo.\n\nUna vez recibida, el pago se acredita aproximadamente dentro de las 72 horas hábiles."
          }
        ],
        "actions": [
          {
            "title": "Abrir guía para emitir y enviar tu factura",
            "description": "Guía paso a paso en PDF",
            "url": "/api/bot-assets/3fcf843de2056a6fbfb65a3227c1ab74865368071985349366a1763d7d75cd6e.pdf"
          }
        ]
      }
    ],
    "country": "Argentina",
    "sourceFlow": "tramites cobrar"
  },
  {
    "id": "tramites-espana",
    "title": "Trámites · España",
    "command": "tramites espana",
    "commands": [
      "tramite espana"
    ],
    "aliases": [
      "tramites España",
      "tramite España",
      "cobrar comisiones España",
      "cobro comisiones España"
    ],
    "phrases": [
      "como cobro en España",
      "como cobrar comisiones en España",
      "tramites para cobrar en España",
      "que necesito para cobrar en España"
    ],
    "keywords": [
      "tramites",
      "comisiones",
      "cuenta bancaria",
      "deposito directo",
      "acuerdo distribuidor",
      "cuestionario",
      "España"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Para habilitar el cobro de comisiones en España, completá estas tres etapas. Necesitás una cuenta bancaria a tu nombre de un banco nacional. No se admiten cuentas digitales como N26, Revolut, Wise o similares."
      },
      {
        "type": "document",
        "kicker": "ETAPA 1 DE 3",
        "title": "Aceptar el Acuerdo al Distribuidor",
        "description": "Aceptá las políticas y condiciones desde tu cuenta de Nu Skin.",
        "sections": [
          {
            "title": "Dónde encontrarlo",
            "body": "Ingresá a tu cuenta de Nu Skin y abrí Volúmenes y My Workspace. Luego tocá tu nombre y aceptá la ventana emergente con las políticas y condiciones."
          }
        ],
        "galleryKicker": "GUÍA VISUAL",
        "galleryTitle": "Ver dónde aceptar el acuerdo",
        "items": [
          {
            "src": "/api/bot-assets/7b7aee3922cc9de41b4901879868b78584129d99fdb7875b38e4597ff70365f0.png",
            "label": "Aceptar el Acuerdo al Distribuidor",
            "mediaType": "image"
          }
        ]
      },
      {
        "type": "document",
        "kicker": "ETAPA 2 DE 3",
        "title": "Registrar la cuenta bancaria",
        "description": "Informá la cuenta donde recibirás tus comisiones.",
        "sections": [
          {
            "title": "Requisitos de la cuenta",
            "body": "La cuenta bancaria debe estar a tu nombre y pertenecer a un banco nacional. No se admiten cuentas digitales como N26, Revolut, Wise o similares."
          },
          {
            "title": "Depósito directo",
            "body": "Ingresá a tu cuenta de Nu Skin, tocá tu nombre y abrí Perfil. Luego elegí Depósito Directo y completá los datos de tu banco y el código IBAN."
          }
        ],
        "galleryKicker": "GUÍA VISUAL",
        "galleryTitle": "Ver cómo registrar la cuenta",
        "items": [
          {
            "src": "/api/bot-assets/4e1e95518e5cc9ef65ad6f4f18e637661cc9773a937f39da8cac4260db8e20b5.png",
            "label": "Registrar cuenta bancaria",
            "mediaType": "image"
          }
        ]
      },
      {
        "type": "document",
        "kicker": "ETAPA 3 DE 3",
        "title": "Pon a prueba tus conocimientos",
        "description": "Capacitación y cuestionario obligatorios para cobrar comisiones.",
        "sections": [
          {
            "title": "Capacitación obligatoria",
            "body": "Ingresá a Volúmenes y My Workspace, abrí Formaciones y seleccioná el curso “Conceptos Básicos sobre Normas”."
          },
          {
            "title": "Cuestionario",
            "body": "Después de la capacitación, Nu Skin te solicitará completar y aprobar el cuestionario. Este requisito es necesario para habilitar el cobro de tus comisiones. Revisá las cuatro capturas como guía para responderlo correctamente."
          },
          {
            "title": "Finalización",
            "body": "Cuando hayas completado las tres etapas, Nu Skin procesará la habilitación y las comisiones se depositarán automáticamente en tu cuenta bancaria."
          }
        ],
        "actions": [
          {
            "title": "Ingresar a la Oficina Virtual",
            "description": "Abrir formaciones de Nu Skin",
            "url": "https://www.nuskin.com/vgclient/#/trainings"
          }
        ],
        "galleryKicker": "CUESTIONARIO OBLIGATORIO",
        "galleryTitle": "Ver cuestionario y respuestas",
        "items": [
          {
            "src": "/api/bot-assets/4e96e32fc7c29285ab3297118ef024341e38e45cb4240e10bf121b0c87e364d0.jpeg",
            "label": "Cuestionario · Parte 1",
            "mediaType": "image"
          },
          {
            "src": "/api/bot-assets/5f78109e3e6a4ba832116c6997b0007f4dfc1038c9befb76b4e1f55070956da3.jpeg",
            "label": "Cuestionario · Parte 2",
            "mediaType": "image"
          },
          {
            "src": "/api/bot-assets/09875bdd9145c1b6ffa9ad97852f6ce8aa27b5e0726d2a3b1527210138684e59.png",
            "label": "Cuestionario · Parte 3",
            "mediaType": "image"
          },
          {
            "src": "/api/bot-assets/daa9e4e0b6f44f444d3bd854d5b90bd2e7d45dbdd9ba84e3a4c642322ff2c47c.png",
            "label": "Cuestionario · Parte 4",
            "mediaType": "image"
          }
        ]
      }
    ],
    "country": "España",
    "sourceFlow": "tramites cobrar"
  },
  {
    "id": "tramites-italia",
    "title": "Trámites · Italia",
    "command": "tramites italia",
    "commands": [
      "tramite italia"
    ],
    "aliases": [
      "tramites Italia",
      "tramite Italia",
      "cobrar comisiones Italia",
      "cobro comisiones Italia"
    ],
    "phrases": [
      "como cobro en Italia",
      "como cobrar comisiones en Italia",
      "tramites para cobrar en Italia",
      "que necesito para cobrar en Italia"
    ],
    "keywords": [
      "tramites",
      "comisiones",
      "documentacion",
      "factura",
      "Italia"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Estos son los pasos cargados en ManyChat para cobrar comisiones en Italia."
      },
      {
        "type": "document",
        "title": "Trámites · Italia",
        "sections": [
          {
            "title": "Paso 1",
            "body": "🇮🇹🇮🇹🇮🇹 Trámites para Italia 🇮🇹🇮🇹🇮🇹\n\nA continuación trámites administrativos para cobrar comisiones en cuenta bancaria\n\n🚨El afiliado debe contar con cuenta bancaria a su nombre\n\nPaso 1️⃣ ACEPTAR EL ACUERDO AL DISTRIBUIDOR\n\nIngresar al link con usuario y clave de la cuenta 👇🏽\n\nPaso 2️⃣ RESPONDER LAS PREGUNTAS (están en inglés)\n\nPaso 3️⃣ ENVIAR CUENTA BANCARIA POR MAIL (Adjunto el pdf)\n\nwesteurope@nuskin.com\n\nMODELO CUERPO DE MAIL 👇🏽\n\nGentile team Nu Skin,\ncon la presente desidero richiedere l’aggiornamento dei miei dati bancari per la ricezione dei pagamenti delle provvigioni. In allegato troverete il modulo compilato per la vostra elaborazione.\nVi chiedo gentilmente di confermare l’avvenuto aggiornamento o, in caso contrario, di indicarmi eventuali ulteriori informazioni necessarie.\nGrazie per la collaborazione.\nCordiali saluti,\n\n[Nombre y apellido]\n[Número ID]"
          }
        ],
        "description": "Paso a paso importado del Bot de ManyChat."
      },
      {
        "type": "link",
        "title": "Abrir Nu Skin",
        "url": "https://www.nuskin.com/vgclient/#/trainings",
        "actionLabel": "Abrir",
        "description": "Trámites · Italia"
      },
      {
        "type": "link",
        "title": "form-mci-it-IT.pdf",
        "url": "/api/bot-assets/4a426b83e09ebe4fcaa79e02e6b72308aaa88a06508340a44591a885329fc779.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · Italia"
      }
    ],
    "country": "Italia",
    "sourceFlow": "tramites cobrar"
  },
  {
    "id": "tramites-mexico",
    "title": "Trámites · México",
    "command": "tramites mexico",
    "commands": [
      "tramite mexico"
    ],
    "aliases": [
      "tramites México",
      "tramite México",
      "cobrar comisiones México",
      "cobro comisiones México"
    ],
    "phrases": [
      "como cobro en México",
      "como cobrar comisiones en México",
      "tramites para cobrar en México",
      "que necesito para cobrar en México"
    ],
    "keywords": [
      "tramites",
      "comisiones",
      "documentacion",
      "factura",
      "México"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Estos son los pasos cargados en ManyChat para cobrar comisiones en México."
      },
      {
        "type": "document",
        "title": "Trámites · México",
        "sections": [
          {
            "title": "Paso 1",
            "body": "🇲🇽🇲🇽🇲🇽 Trámites para MÉXICO 🇲🇽🇲🇽🇲🇽\n\nA continuación trámites administrativos para cobrar las comisiones en tu cuenta bancaria.\n\nEnvía los siguientes documentos:\n\n1️⃣ Descarga, Imprime y completa el acuerdo de afiliado de marca. Luego hazle una foto.\n\nIMPORTANTE 1: Sólo se admiten cuentas bancarias, las cuentas digitales, no son admitidas para el pago de comisiones.\n\nIMPORTANTE 2:  En el siguiente PDF tienes indicaciones claras para completar correctamente el acuerdo y te lo aprueben en la primera vez que lo envíes!!\n\n2️⃣  Ingresa a la página del SAT y descarga la constancia de situación fiscal actualizada.\n\nEnvía estos 2 documentos\n\n- Acuerdo al afiliado y Constancia, a la siguiente dirección de correo:\n\ndocumentos@nuskin.com\n\nINDICANDO en el asunto del correo,\n\ntu numero de ID (MX...) y en el cuerpo del correo, Envío documentación para el cobro de comisiones.\n\n3️⃣ Desde tu oficina virtual debes ingresar al apartado Entrenamientos y tomar el curso llamado \"Conceptos Básicos de las Políticas\", el cual consta de un video y un cuestionario de 4 preguntas que debe responder correctamente para que pueda ser considerado como aprobado.\n\ny aquí a continuación tienes las afirmaciones correctas a cumplimentar!\n\nGenial!\n\nHabiendo cumplido estos pasos,\nen pocos días hábiles ya estarás autorizad@ para enviar tus facturas y que te hagan el pago de tus comisiones en la cuenta bancaria!!\n\n¿Hasta aquí todo ok?\n\nAhora vamos a Cómo Facturar y ENVIAR TU FACTURA"
          },
          {
            "title": "Paso 2",
            "body": "Para ver las comisiones vas a ingresar a la app de Stela con tu usuario y vas a poder verlas en la opción\n\n>> documentos, impuestos o tax documents\n\ny ahí tienes todos los datos para hacer tu FACTURA.\n\nRevisa el siguiente PDF para el paso a paso!\n\nEnvía tus facturas a la siguiente dirección de correo:\n\nfcomisionesmex@nuskin.com\n\nINDICANDO en el asunto del correo, tu número de ID (MX….)\n\nAhora si, a esperar las comisiones..."
          }
        ],
        "description": "Paso a paso importado del Bot de ManyChat."
      },
      {
        "type": "link",
        "title": "Abrir Nu Skin",
        "url": "https://www.nuskin.com/content/dam/office/s_america/MX/es/business_materials/mx_acuerdo_del_afiliado.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "Abrir recurso",
        "url": "https://www.sat.gob.mx/aplicacion/login/53027/genera-tu-constancia-de-situacion-fiscal",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "Abrir Nu Skin",
        "url": "https://www.nuskin.com/vgclient/#/trainings",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "MX66.67.pdf",
        "url": "/api/bot-assets/97bec3ced436dde87eb27ff20cb674cf2870c8667b94aac35dffac824e22c646.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2026-05-20 at 22.46.42.jpeg",
        "url": "/api/bot-assets/bdf261c1fe50022c0855e527a77ee44b0524076bf360a370117af055239064ea.jpeg",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2026-05-20 at 22.46.42 (1).jpeg",
        "url": "/api/bot-assets/4012d11483ab4d3bbcc5b3a30db4c99feb949cf9c9b0e5fbd9fbd3b33e40cbf2.jpeg",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2026-05-20 at 22.46.43.jpeg",
        "url": "/api/bot-assets/c4027d70de068e1ba045ea66e61d48cb5d791ba54449ad6bdf33bfcd9736b2ed.jpeg",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      },
      {
        "type": "link",
        "title": "MX68.70.pdf",
        "url": "/api/bot-assets/4e8b85077caa8a85108c961bfee2a92a2cc99f11fd56b55e3eaf9202d18f86a9.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · México"
      }
    ],
    "country": "México",
    "sourceFlow": "tramites cobrar"
  },
  {
    "id": "tramites-peru",
    "title": "Trámites · Perú",
    "command": "tramites peru",
    "commands": [
      "tramite peru"
    ],
    "aliases": [
      "tramites Perú",
      "tramite Perú",
      "cobrar comisiones Perú",
      "cobro comisiones Perú"
    ],
    "phrases": [
      "como cobro en Perú",
      "como cobrar comisiones en Perú",
      "tramites para cobrar en Perú",
      "que necesito para cobrar en Perú"
    ],
    "keywords": [
      "tramites",
      "comisiones",
      "documentacion",
      "factura",
      "Perú"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Estos son los pasos cargados en ManyChat para cobrar comisiones en Perú."
      },
      {
        "type": "document",
        "title": "Trámites · Perú",
        "sections": [
          {
            "title": "Paso 1",
            "body": "🇵🇪🇵🇪🇵🇪 Trámites para PERÚ🇵🇪🇵🇪🇵🇪\n\nTrámites administrativos para cobrar las comisiones en tu cuenta bancaria.\n\nAquí te dejamos un paso a paso de cómo generar tu cuenta de detracciones y qué regimen es el conveniente para tu RUC.\n\nLuego vas a completar\nel acuerdo de afiliado y el documento de cobro de comisiones con los datos brindados por el BN y SUNAT.\n\nEnvía los siguientes documentos:\n\n1.Descarga, Imprime y completa el acuerdo de afiliado de marca.\n\nLuego hazle una foto.\n\n2. Descarga, Imprime y completa el formato de depósito de comisiones.\n\nLuego hazle una foto.\n\nEnvía estos 2 documentos a la siguiente dirección de correo:\n\ndocumentos@nuskin.com\n\nINDICANDO en el asunto del correo, tu numero de ID (PE….)\n\nEnvío documentación para el cobro de comisiones.\n\nEnvía tus facturas a la siguiente dirección de correo.\n\nperufacturas@nuskin.com\n\nINDICANDO en el asunto del correo, tu número de ID (PE….)\n\nUna vez Nu Skin recibida tu factura, en 24hs hábiles, tendrás las comisiones depositadas en tu cuenta bancaria."
          },
          {
            "title": "Paso 2",
            "body": "3️⃣ Desde tu oficina virtual debes ingresar al apartado Entrenamientos y tomar el curso llamado \"Conceptos Básicos de las Políticas\", el cual consta de un video y un cuestionario de 4 preguntas que debe responder correctamente para que pueda ser considerado como aprobado.\n\ny aquí a continuación tienes las afirmaciones correctas a cumplimentar!"
          }
        ],
        "description": "Paso a paso importado del Bot de ManyChat."
      },
      {
        "type": "link",
        "title": "Abrir recurso",
        "url": "/api/bot-assets/f65f14d01b558c33558d31103fedfc627b4c119328ea2df96af2c01e6bbf7f2a.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      },
      {
        "type": "link",
        "title": "Proceso de Cobro de comisiones Perú - 2023.pdf",
        "url": "/api/bot-assets/5bc97737202e7bace3f0415cbaa3ccde57ef8b720e828ee6b25f838fa877791c.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      },
      {
        "type": "link",
        "title": "pe_formato_deposito_comisiones.pdf",
        "url": "/api/bot-assets/1c492a85c8e7eb48b6ebd1302f0fa4b67819d50c9f7d54eba5246df7e3f14fea.pdf",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      },
      {
        "type": "link",
        "title": "Abrir Nu Skin",
        "url": "https://www.nuskin.com/vgclient/#/trainings",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2026-05-20 at 22.46.42.jpeg",
        "url": "/api/bot-assets/bdf261c1fe50022c0855e527a77ee44b0524076bf360a370117af055239064ea.jpeg",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2026-05-20 at 22.46.42 (1).jpeg",
        "url": "/api/bot-assets/4012d11483ab4d3bbcc5b3a30db4c99feb949cf9c9b0e5fbd9fbd3b33e40cbf2.jpeg",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2026-05-20 at 22.46.43.jpeg",
        "url": "/api/bot-assets/c4027d70de068e1ba045ea66e61d48cb5d791ba54449ad6bdf33bfcd9736b2ed.jpeg",
        "actionLabel": "Abrir",
        "description": "Trámites · Perú"
      }
    ],
    "country": "Perú",
    "sourceFlow": "tramites cobrar"
  },
  {
    "id": "primera-venta",
    "title": "Primera venta",
    "command": "primera venta",
    "aliases": [
      "mi primera venta",
      "hacer primera venta",
      "primera compra cliente"
    ],
    "phrases": [
      "como hago mi primera venta",
      "como hacer mi primera venta",
      "necesito hacer una primera venta",
      "como doy de alta un cliente para comprar"
    ],
    "keywords": [
      "dar de alta cliente",
      "acompanar compra",
      "cliente nuevo"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Accede al video donde aprenderás a dar de alta un cliente y acompañarlo con su primera compra!"
      },
      {
        "type": "link",
        "title": "Tutorial · Primera venta",
        "url": "https://www.youtube.com/watch?v=-9zpcx1_Mt8",
        "actionLabel": "Abrir",
        "description": "Dar de alta un cliente y acompañarlo con su primera compra.",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "primera venta"
  },
  {
    "id": "info-argentina",
    "title": "Info Argentina",
    "command": "info argentina",
    "aliases": [
      "argentina",
      "nuskin argentina",
      "informacion argentina",
      "info nuskin argentina"
    ],
    "phrases": [
      "necesito informacion de argentina",
      "datos de nuskin argentina",
      "contacto nuskin argentina",
      "codigos de productos argentina",
      "seguimiento de pedido argentina",
      "como facturar en argentina"
    ],
    "keywords": [
      "argentina",
      "catalogo",
      "pedidos",
      "andreani",
      "facturar",
      "cuit",
      "call center",
      "productos"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Información del mercado de Argentina: productos, pedidos, contactos, catálogo, flyers y facturación."
      },
      {
        "type": "document",
        "title": "Info Argentina",
        "sections": [
          {
            "title": "Seguimiento de pedidos",
            "body": "✨ ¿Querés saber por dónde va tu envío?\n\n1️⃣ Ingresá a nuskin.com con el usuario y contraseña de la persona que realizó el pedido.\n\n2️⃣ Entrá al perfil (donde aparece su nombre).\n\n3️⃣ Hacé clic en ”Historial de pedidos”.\nAhí vas a ver el pedido y, entre 72 y 96 hs después de hacerlo, se habilita el número de guía.\n\n4️⃣ Con ese número, ingresá a la página de Andreani.com para seguir el estado del envío:\n\nLink directo al seguimiento...\n\n✅ ¡Listo! Ahí verás en qué etapa está tu pedido y cuándo llega."
          },
          {
            "title": "Contacto y datos de Nu Skin",
            "body": "Call Center: +54 115 984 1871\nLun a vier 11:00 AM – 9:00 PM\n\nChat con operador:\n\nEnvío Documentos: documentos@nuskin.com\n\nCobro comisiones: facturas@nuskin.com\n\nCentro de aprendizaje\n\nCUIT NUSKIN 30690833030"
          },
          {
            "title": "Códigos de productos",
            "body": "En suscripción : 23002344\n\nPack 3 colágenos : 23130445\n\nPack 6 colágenos: 23130446\n\nPack 12 colágenos : 23130440\n\nLumiSpa RoseGold: 23130436\n\nLumiSpa: 23130433\n\nKIT INICIO 500 : 23130433 + 23130446"
          },
          {
            "title": "Cómo facturar",
            "body": "PASOS PARA FACTURAR\n\nEntrar a ARCA con la  clave fiscal\n\nComprobantes en línea\n\nClick en nuestro nombre\n\nGenerar comprobante\n\nPunto de venta a utilizar: se le da de alta el numero 1 con nuestra dirección\n\nTipo de comprobante: C (monotributistas)\n\nFecha del comprobante: (el día que se hace la fc)\n\nConceptos a incluir: servicios\n\nDesde: 01/XX/2025 hasta 31/xx/2025\n\nVto para el pago: fecha de la factura\n\n... continuar\n\nCondición frente al IVA: Responsable inscripto\n\nCUIT: 30690833030  (y ahí nos van a aparecer los datos de Nuskin)\n\nCondiciones de venta: contado\n\nDonde habla de remito no ponemos nada y le damos continuar\n\ny llenamos la parte del cuerpo de la factura:\n\n- Cod: 001\n\n- Producto: COPIAR LO QUE DICE LA FACTURA EN TAX DOCUMENTS\n\n- Cantidad: 1\n\n- Unidad de medida: unidad\n\n- Precio unitario: importe total de nuestra comisión.\n\n....continuar\n\nChequea los datos, si te equivocaste en algo podes ir para atrás\n\ny luego confirmas...\n\nTe hace un PDF y ahí volves a confirmar datos,\n\nLuego lo descargar como para imprimir\n\nY NO OLVIDES:\n\nEnvía tus facturas a la siguiente dirección de correo:\n\nfacturas@nuskin.com\n\nINDICANDO en el asunto del correo, tu número de ID (AR….)\n\nY como Cuerpo del mail: buenos días, envío factura del AR…..\n\nUna vez que Nu Skin reciba tu factura, en 72hs hábiles, tendrás las comisiones depositadas en tu cuenta bancaria."
          }
        ],
        "description": "Información importada del Bot de ManyChat."
      },
      {
        "type": "link",
        "title": "Seguimiento Andreani",
        "url": "https://www.andreani.com/?gad_source=1&gad_campaignid=22621933320&gbraid=0AAAAADO9JOPH2qLe6mFn9ZrY-B-PJpT9i#!/pymes/carta-documento",
        "actionLabel": "Abrir",
        "description": "Info Argentina"
      },
      {
        "type": "link",
        "title": "Chat con operador",
        "url": "https://www.nuskin.com/content/nuskin/es_AR/corporate/help/chat.html",
        "actionLabel": "Abrir",
        "description": "Info Argentina"
      },
      {
        "type": "link",
        "title": "Centro de aprendizaje",
        "url": "https://www.nuskin.com/vgclient/#/trainings",
        "actionLabel": "Abrir",
        "description": "Info Argentina"
      },
      {
        "type": "link",
        "title": "Catálogo Argentina",
        "url": "https://catalogo.nuskin.com/argentina/catalogo-argentina-2025/",
        "actionLabel": "Abrir",
        "description": "Info Argentina"
      },
      {
        "type": "link",
        "title": "Flyers con precios",
        "url": "https://photos.google.com/share/AF1QipMm7cIg5467sYlFZTOj3QvkgjtfHzBAtNlW3XLvQ2UBEnrO4ODa9jl9cqoNZVWtoQ?key=ejk3Z1dfcnV5VFo1MmIySy03V19JejFBVTVXR3F3",
        "actionLabel": "Abrir",
        "description": "Info Argentina"
      }
    ],
    "country": "Argentina",
    "sourceFlow": "nuskin argentina"
  },
  {
    "id": "estrategia-colageno-europa",
    "title": "Estrategia Colágeno Europa",
    "command": "estrategia colageno europa",
    "aliases": [
      "colageno europa",
      "estrategia collagen europa",
      "estrategia collagen+ europa",
      "pack 3 colagenos europa"
    ],
    "phrases": [
      "como hago la estrategia de colageno en europa",
      "como armo el pack de 3 colagenos en europa",
      "como hacer la oferta de colageno europa"
    ],
    "keywords": [
      "europa",
      "colageno",
      "collagen",
      "15 descuento",
      "stela",
      "pack 3"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Estrategia de ManyChat para crear una oferta de 3 Collagen+ en Europa mediante Stela."
      },
      {
        "type": "document",
        "title": "Estrategia Colágeno Europa",
        "sections": [
          {
            "title": "Cómo se arma la oferta",
            "body": "Que bueno que tienes vendido un pack de 3 colágenos en Europa con nuestra estrategia del 15% de descuento por Stela por comprar el pack de 3 unidades.\n\nEs importante que sepas que como tal no existe ese pack de 3 colágenos en la pagina de Nu skin, entonces lo que hacemos es armar una oferta en Stela creándola con 3 colágenos y aplicándole el 15% off.   El codigo de producto que debes elegir cuando armes tu oferta es : 85892208 (en España)\n\nA continuación te dejamos un video tutorial."
          },
          {
            "title": "Cómo enviarla al cliente",
            "body": "Recuerda primero pedirle su nombre, mail y teléfono para darle de alta como cliente tu, luego que tienes su usuario y contraseña, le creas el link de oferta y se lo envías...\n\nIndicandole a que INGRESE CON EL USUARIO Y CONTRASEÑA QUE LE ESTAS PASANDO que acabas de crear!\n\nSi la persona ya es cliente de antes porque por ejemplo te compro la lumispa, le pasas el link de la oferta y le indicas que ingrese con su usuario y contraseña que ya tiene y ahí vera el descuento en los colágenos, siempre que entre desde EL LINK DE LA OFERTA QUE LE ENVIASTE."
          }
        ]
      },
      {
        "type": "link",
        "title": "Video tutorial",
        "url": "https://youtube.com/shorts/NYtC3fUyHz8?feature=share",
        "actionLabel": "Abrir",
        "description": "Estrategia Collagen+ Europa",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "Estrategia Colageno Europa"
  },
  {
    "id": "como-usar",
    "title": "Cómo usar",
    "command": "como usar",
    "aliases": [
      "cómo usar",
      "uso de tecnologias",
      "usar tecnologias",
      "como se usa"
    ],
    "phrases": [
      "como uso mis tecnologias",
      "quiero aprender a usar mi dispositivo",
      "como se usan las tecnologias"
    ],
    "keywords": [
      "boost",
      "lumispa",
      "lumi spa",
      "facial spa",
      "wellspa",
      "well spa",
      "face wash 180"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Elegí la tecnología o producto que querés aprender a usar. Podés escribir cualquiera de estas opciones:"
      },
      {
        "type": "document",
        "title": "Cómo usar",
        "sections": [
          {
            "title": "ageLOC Boost",
            "body": "Escribí: como usar boost"
          },
          {
            "title": "ageLOC LumiSpa",
            "body": "Escribí: como usar lumispa"
          },
          {
            "title": "ageLOC Facial Spa",
            "body": "Escribí: como usar facial spa"
          },
          {
            "title": "ageLOC WellSpa",
            "body": "Escribí: como usar wellspa"
          },
          {
            "title": "Face Wash 180",
            "body": "Escribí: como usar face wash 180"
          }
        ],
        "description": "Contenido migrado del menú “COMO USAR” de ManyChat."
      }
    ],
    "sourceFlow": "COMO USAR"
  },
  {
    "id": "como-usar-boost",
    "title": "Cómo usar · Boost",
    "command": "como usar boost",
    "commands": [
      "como usar ageloc boost"
    ],
    "aliases": [
      "boost",
      "ageloc boost"
    ],
    "phrases": [
      "como uso boost",
      "como uso ageloc boost",
      "como se usa boost",
      "como se usa ageloc boost"
    ],
    "keywords": [
      "como usar",
      "Boost",
      "boost",
      "ageloc boost"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Guía cargada en ManyChat para usar Boost."
      },
      {
        "type": "document",
        "title": "Cómo usar · Boost",
        "sections": [
          {
            "title": "✨ CÓMO USAR TU BOOST✨",
            "body": "✨ CÓMO USAR TU BOOST✨\n\nMi primer recomendación importante es que te tomes FOTOS de tu Rostro 📸 ANTES del 1er uso !!! y luego a los días, y semanas , para que puedas ver lo linda que te va dejando la piel ☺️🙌🏻\n\nEl Boost ya viene con su instructivo 👍🏻 Y es super simple de usar! 😃 Lo primero que debes hacer es ponerlo a cargar hasta que deje de parpadear la luz ( tal vez te tome de 10 a 14 horas) y una vez que ya este totalmente cargado, lo puedes empezar a usar !\n\nFORMA DE USO 😊👇🏻\n\nMira este video para tener la práctica de los movimientos:"
          },
          {
            "title": "Siempre con la cara limpia",
            "body": "Siempre con la cara limpia\n\n1️⃣ Haces Swipe-up (pasando el dedo por la máquina para prenderla, como muestro en el video!)\n\n2️⃣ coloca 3 gotas de SERUM en el cabezal\n\n3️⃣ desparrama el serum en mitad de rostro\n\n4️⃣ vuelve a darle Swipe-up para que comience a funcionar (comenzará a vibrar 1 vez por segundo aprox! 🙌🏻)\n\n5️⃣ lo pasas 1 min. en mitad de rostro, hasta que deja de vibrar\n\n6️⃣ repites el mismo procedimiento desde el punto 2 (colocar 3 gotas/desparramar mitad rostro/swipe-up/ pasar hasta que se apaga)"
          },
          {
            "title": "Ten en cuenta 6 cosas importantes ! 👇🏻👇🏻",
            "body": "Ten en cuenta 6 cosas importantes ! 👇🏻👇🏻\n\n1️⃣ Se usa LUEGO de tu limpieza facial (ya sea por la mañana o por la noche, como prefieras) y luego del tónico.\n2️⃣ se usa sólo 1 vez al dia, en 2 minutos (1 min. en c/ mitad de rostro 😉)\n3️⃣ El serum NO se retira! Luego de usarlo, solo haces masajes y se absorbe en tu piel 🥰 y después sigues con tu rutina normal (colocas tu hidratante/crema/factor solar si es de dia)\n4️⃣ al usarlo emite una vibración (casi 1 por segundo!) asi que la vas a sentir y escuchar 😊👍🏻\n5️⃣no es sumergible!! Asi que no lo debes mojar 💦\n6️⃣ si acaso cuando lo estés pasando por tu piel, se frena, seguramente sea porque colocaste Poco serum☝🏻 (ten en cuenta que para que la máquina funcione correctamente, el cabezal debe tener serum)\n\n——-\nListo hermosa!!\nLuego cuéntame cómo te fue y qué te pareció !!! 😃 y pregúntame lo que necesites claro 🙌🏻 Aquí quedo a disposición 🤍"
          }
        ]
      },
      {
        "type": "link",
        "title": "Ver el Video",
        "url": "https://youtu.be/wNyuhIH03u4?si=pHWRCZmvO2jlglga",
        "actionLabel": "Abrir",
        "description": "Cómo usar · Boost",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "COMO USAR",
    "hidden": true
  },
  {
    "id": "como-usar-lumispa",
    "title": "Cómo usar · LumiSpa",
    "command": "como usar lumi spa",
    "commands": [
      "como usar lumispa",
      "como usar lumi"
    ],
    "aliases": [
      "lumi spa",
      "lumispa",
      "lumi"
    ],
    "phrases": [
      "como uso lumi spa",
      "como uso lumispa",
      "como uso lumi",
      "como se usa lumi spa",
      "como se usa lumispa",
      "como se usa lumi"
    ],
    "keywords": [
      "como usar",
      "LumiSpa",
      "lumi spa",
      "lumispa",
      "lumi"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Guía cargada en ManyChat para usar LumiSpa."
      },
      {
        "type": "document",
        "title": "Cómo usar · LumiSpa",
        "sections": [
          {
            "title": "✨ CÓMO USAR TU LUMI ✨",
            "body": "✨ CÓMO USAR TU LUMI ✨\n\nMi primera recomendación IMPORTANTE es que te saques fotos ANTES del 1er uso 📸 (de frente y de ambos lados).\nLuego vuelve a tomarte fotos después de usarla, a los días y a las semanas. Así juntas vamos a poder ver los cambios y avances 🙌🏻💖"
          },
          {
            "title": "🔋 Carga inicial:",
            "body": "🔋 Carga inicial:\n•\tConéctala hasta que la luz deje de parpadear (puede tardar entre 10 y 14 horas).\n•\tDespués, no hace falta cargarla todos los días. Vas a notar que al cabo de 2 a 4 semanas se enciende una luz naranja 🔶: recién ahí es cuando debes volver a cargarla.\n\n📲 Forma de uso paso a paso:\nAquí tienes el link con videos explicativos para que veas cómo utilizarla correctamente:\n\n👉🏼"
          }
        ]
      },
      {
        "type": "link",
        "title": "Ver el Video",
        "url": "https://youtube.com/playlist?list=PLUWelFQi1Qz4fSnq78FGfhUm4bvz6xZXD&si=69EVbjR2c-NwO7V3",
        "actionLabel": "Abrir",
        "description": "Cómo usar · LumiSpa",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "COMO USAR",
    "hidden": true
  },
  {
    "id": "como-usar-facial-spa",
    "title": "Cómo usar · Facial Spa",
    "command": "como usar facial spa",
    "commands": [
      "como usar galvanica facial",
      "como usar galvanic facial"
    ],
    "aliases": [
      "facial spa",
      "galvanica facial",
      "galvanic facial"
    ],
    "phrases": [
      "como uso facial spa",
      "como uso galvanica facial",
      "como uso galvanic facial",
      "como se usa facial spa",
      "como se usa galvanica facial",
      "como se usa galvanic facial"
    ],
    "keywords": [
      "como usar",
      "Facial Spa",
      "facial spa",
      "galvanica facial",
      "galvanic facial"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Guía cargada en ManyChat para usar Facial Spa."
      },
      {
        "type": "document",
        "title": "Cómo usar · Facial Spa",
        "sections": [
          {
            "title": "✨CÓMO USAR TU GALVANICA FACIAL  ✨",
            "body": "✨CÓMO USAR TU GALVANICA FACIAL  ✨\n\nMi primera recomendación\n\nIMPORTANTE es:\n\n1. tomate FOTOS 📸 de todas las zonas que vayas a tratar (de frente, de los cachetes, de los ojos donde están las líneas de expresión si es que las hay ) ANTES de comenzar a usarla!! y luego de hacer tu 1er sesión (y a los días, y semanas..) para poder juntas ir viendo tu progreso ☺️🙌🏻\n\nAqui te comparto la página en donde encontrarás nuestro MANUAL DE USO !! allí tienes los tutoriales paso a paso de TODAS las tecnologías!! preguntas frecuentes y también productos complementarios\n\nPágina ➡️"
          },
          {
            "title": "Por último un par de TIPS importantes para tener en cuenta con el tratamiento FA",
            "body": "Por último un par de TIPS importantes para tener en cuenta con el tratamiento FACIAL ❕❕ 👇🏻\n\n- tomar 2 o 2 y 1/2 Lts. de AGUA 💧 por dia! Ya que es una tecnología drenante y no funciona si estamos deshidratados 😅☝🏻\n\n- ser Constante ☝🏻 usar 2-3 veces por semana (por ejemplo Lun, Mie y Vier) la máquina junto con la caja de geles faciales ( el transparente y el azul)\n\n- pasados los 3 meses de tratamiento, puedes comenzarla a usar de forma menos constante ( osea: 1 vez cada 5 - 7 días 😄👍🏻) ya que comienzas la etapa que llamamos “mantenimiento” (aunque si quieres mantener la frecuencia de 2-3 veces por semana, Genial !!)\n\n- La máquina no vibra y no emite calor (ni arde ni duele ni nada!!😄) entonces, Cómo darte cuenta que está prendida y funcionando bien?? 👍🏻\n\n✔️ porque emite un ruido (“beep”) cada 10 segundos (pasados los 5 min hará un Beep mas largo y se apaga sola)\n✔️ porque la LUZ de la pantalla está prendida\n\n✔️ Entonces: para usarla, debes agarrarla con la mano ✋🏻 HUMEDA desde los bordes plateados, y SOLO funcionará cuando la apoyes en tu piel humedecida\n\n❌ si la luz se apaga, o parpadea, o no escuchas el “beep” , probablemente no se esté usando correctamente ☝🏻"
          },
          {
            "title": "➡️ PLUS: y si deseo hacerle el tratamiento a otra persona?? 👫  en ese caso, debe",
            "body": "➡️ PLUS: y si deseo hacerle el tratamiento a otra persona?? 👫  en ese caso, deberás:\n\n- mojar la mano con la que agarras la máquina ✋🏻\n- Mojar tu otra mano también ✋🏻 y TOCAR a la otra persona en cualquier zona de su PIEL durante todo el tratamiento (ya que 2 personas son 2 circuitos diferentes, entonces para favorecer la conductividad de la corriente, debes cerrar el circuito, sino la máquina NO funcionará 😉🙌🏻)\n\n🧽 cómo la LIMPIO luego de su uso?? Con un paño / trapito húmedo para retirar el excedente de gel, se seca con una toalla limpia y LISTO 👌🏻\n\n——-\n\nListo hermosa!!\nLuego cuéntame cómo te fue con el tratamiento y qué te pareció !!! 😃\n\ny pregúntame lo que necesites claro 🙌🏻 te voy a acompañar en todo para que tengas los mejores resultados ☺️"
          }
        ]
      },
      {
        "type": "link",
        "title": "Video · Facial Spa",
        "url": "https://youtu.be/g8C-j9PfueQ?si=z4IqlfYdn3C4Yblf",
        "actionLabel": "Abrir",
        "description": "Cómo usar · Facial Spa",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "COMO USAR",
    "hidden": true
  },
  {
    "id": "como-usar-wellspa",
    "title": "Cómo usar · WellSpa",
    "command": "como usar well spa",
    "commands": [
      "como usar wellspa",
      "como usar wellspa io"
    ],
    "aliases": [
      "well spa",
      "wellspa",
      "wellspa io"
    ],
    "phrases": [
      "como uso well spa",
      "como uso wellspa",
      "como uso wellspa io",
      "como se usa well spa",
      "como se usa wellspa",
      "como se usa wellspa io"
    ],
    "keywords": [
      "como usar",
      "WellSpa",
      "well spa",
      "wellspa",
      "wellspa io"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Guía cargada en ManyChat para usar WellSpa."
      },
      {
        "type": "document",
        "title": "Cómo usar · WellSpa",
        "sections": [
          {
            "title": "✨CÓMO USAR TU WELL SPA ✨",
            "body": "✨CÓMO USAR TU WELL SPA ✨"
          },
          {
            "title": "Mis primeras 2  recomendaciones IMPORTANTES son:",
            "body": "Mis primeras 2  recomendaciones IMPORTANTES son:\n\n1. tomate FOTOS 📸 de todas las zonas que vayas a tratar (de frente, de ambos costados y de espaldas) ANTES de comenzar a usarla!! y luego de hacer tu 1er sesión (y a los días, y semanas..) para poder ir evaluando tu progreso ☺️🙌🏻\n\n2. MIDETE con un centímetro (midete las partes más finas y más anchas del abdomen/piernas/brazos/caderas) y toma nota de esas medidas📝! Para que puedas comparar luego 😃👍🏻"
          },
          {
            "title": "Tienes 3 tipos de “rutinas” que puedes hacer con este dispositivo:",
            "body": "Tienes 3 tipos de “rutinas” que puedes hacer con este dispositivo:"
          },
          {
            "title": "1️⃣ REVITALIZA:",
            "body": "1️⃣ REVITALIZA:\n\n(usas la máquina con el producto: “Body SERUM”) esta función sirve para obtener basicamente los mismos beneficios que la galvanica Corporal : tonifica, reduce piel de naranja, alisa la piel y la hidrata ✔️"
          },
          {
            "title": "2️⃣ RECUPERA:",
            "body": "2️⃣ RECUPERA:\n\n(usas la máquina con producto: “Body Activating gel”) esto es lo Mas nuevo que nos trae la WellSpa iO ! Esta rutina nos ayuda a recuperar y preparar mejor el cuerpo para antes y después de ejercitarnos, de tener un largo dia. Proporciona un masaje previo al entrenamiento que ayuda a despertar/accionar esos músculos que se van a sentir estimulados y listos para funcionar . Y luego de entrenar nos proporciona un masaje para relajar los músculos cansados, fomentando la relajación, la recuperación y la frescura. Ayuda a aumentar la MOVILIDAD CORPORAL ya que disminuye la tensión que queda en los músculos luego de entrenar!"
          },
          {
            "title": "3️⃣ REESTABLECE:",
            "body": "3️⃣ REESTABLECE:\n\n(nuevamente, la máquina la usas junto al “Body Activating gel”) trabaja el bienestar INTERIOR , ayuda a que nos sintamos mas RELAJADOS. Reduce la inflamación y favorece el movimiento de fluidos en conjunto a determinados movimientos, ayudando a que las extremidades se sientan más ligeras"
          }
        ]
      },
      {
        "type": "link",
        "title": "VER VIDEO",
        "url": "https://youtu.be/kEaTX6b0RMk?si=vPanoEq8jUjf6WnU",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa",
        "resourceKind": "video"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.54.54.jpeg",
        "url": "/api/bot-assets/f6bd35061252b46cfcc9251a4cc40d22feb17693114bf84e73f737cdcddea451.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.54.54 (1).jpeg",
        "url": "/api/bot-assets/beb348862f8007d482e02995e31ea49ab2f0f538e2a80abb04ce06be30e8f869.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.54.55.jpeg",
        "url": "/api/bot-assets/c83b726135bff0061c10e0f308bdfef82c97c6d1fcd4724b2ae66206fa6b2316.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.54.55 (1).jpeg",
        "url": "/api/bot-assets/3964f2995396cf8f55cf4a2c1a5c838137b49b4c5dc239cc9be879dbb1385faf.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.54.55 (2).jpeg",
        "url": "/api/bot-assets/1442bc74657d4103065a8f00b4c51c0ebefc50dfb85d08427a524e892277b685.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa"
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.54.56.jpeg",
        "url": "/api/bot-assets/9122c8bdac58759ac1df1ef8764b32958aa502fc43599dd8bdf2a7c7b808550f.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · WellSpa"
      }
    ],
    "sourceFlow": "COMO USAR",
    "hidden": true
  },
  {
    "id": "como-usar-face-wash-180",
    "title": "Cómo usar · Face Wash 180",
    "command": "como usar face wash 180",
    "commands": [
      "como usar face wash"
    ],
    "aliases": [
      "face wash 180",
      "face wash"
    ],
    "phrases": [
      "como uso face wash 180",
      "como uso face wash",
      "como se usa face wash 180",
      "como se usa face wash"
    ],
    "keywords": [
      "como usar",
      "Face Wash 180",
      "face wash 180",
      "face wash"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Guía cargada en ManyChat para usar Face Wash 180."
      },
      {
        "type": "link",
        "title": "WhatsApp Image 2025-10-16 at 21.55.57.jpeg",
        "url": "/api/bot-assets/2f547148a45fc71700942a8cee95b7e2b0d72f3c66d7f1101fc78164d7b1caf9.jpeg",
        "actionLabel": "Abrir",
        "description": "Cómo usar · Face Wash 180"
      }
    ],
    "sourceFlow": "COMO USAR",
    "hidden": true
  },
  {
    "id": "box-colageno",
    "title": "Box Colágeno",
    "command": "box colageno",
    "aliases": [
      "box colágeno",
      "box collagen",
      "box collagen+",
      "colageno",
      "colágeno",
      "collagen",
      "collagen+"
    ],
    "phrases": [
      "quiero informacion del colageno",
      "necesito material de colageno",
      "precios de colageno",
      "testimonios de colageno",
      "ficha tecnica colageno",
      "ganancias colageno"
    ],
    "keywords": [
      "beauty focus collagen",
      "precios",
      "ganancias",
      "testimonios",
      "papers",
      "ficha tecnica",
      "asesorar"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "📦 BOX de COLÁGENO: acá tenés reunidos los materiales principales de Beauty Focus Collagen+ que estaban en ManyChat."
      },
      {
        "type": "document",
        "title": "Capacitación de producto",
        "sections": [
          {
            "title": "Capacitación de producto",
            "body": "¿Quieres saber más del colágeno? 🧐\n\nTe recomiendo que veas esta capacitación 👇🏻"
          }
        ]
      },
      {
        "type": "link",
        "title": "Capacitación de producto",
        "url": "https://youtu.be/QJvzYmBs1Hg",
        "actionLabel": "Abrir",
        "description": "Beauty Focus Collagen+",
        "resourceKind": "video"
      },
      {
        "type": "document",
        "title": "Guía para asesorar",
        "sections": [
          {
            "title": "Guía para asesorar",
            "body": "Aquí te comparto una guía para asesorar y automatizar tus respuestas en whatsapp business"
          }
        ]
      },
      {
        "type": "link",
        "title": "Guía para asesorar",
        "url": "https://docs.google.com/document/d/1mznuJzMyEgFuHVSLfDE32-vxFWlSQdq8kuZ6RXB9gdc/edit?usp=sharing",
        "actionLabel": "Abrir",
        "description": "Guía para asesorar y automatizar respuestas en WhatsApp Business"
      },
      {
        "type": "document",
        "title": "Precios por mercado",
        "sections": [
          {
            "title": "Precios por mercado",
            "body": "Aquí te comparto el link con los precios de colágeno por países.\n\nTe recomiendo antes de enviar el valor, dar un asesoramiento previo y preguntarle a la persona que es lo que quiere mejorar.\n\n(Como te explicamos en la sección Como asesorar)\n\nUna vez enviado el flyer con el valor hacer una pregunta de cierre de venta:\n\n❓Que te parece hermosa?\n\n❓Te gustaría aprovechar a tu también la promo?\n\nSi necesitas ayuda para las primeras respuestas, consultale a la persona que te invitó o en la comunidad de whapp\n\nFLYERS POR MERCADO"
          }
        ]
      },
      {
        "type": "link",
        "title": "Precios por mercado",
        "url": "https://photos.app.goo.gl/dsjn9iJgwsVJMtw86",
        "actionLabel": "Abrir",
        "description": "Flyers con precios por país"
      },
      {
        "type": "document",
        "title": "Antes y después",
        "sections": [
          {
            "title": "Antes y después",
            "body": "Aquí te comparto un link con antes y después/testimonios.\n\nTe recomiendo que a medida que los vayas necesitando los descargues en tu celular y los compartas desde allí,\n\nno directamente desde el link.\n\nPuedes crear un Álbum en tu teléfono\n\nque se llame: Antes y después colágeno así ya los vas ordenando."
          }
        ]
      },
      {
        "type": "link",
        "title": "Antes y después",
        "url": "https://drive.google.com/drive/folders/1TnsiJtMO7R-yIkVvy9wIE7Qj0Zc-5hM7?usp=sharing",
        "actionLabel": "Abrir",
        "description": "Testimonios, fotos y videos"
      },
      {
        "type": "document",
        "title": "Ganancias por mercado",
        "sections": [
          {
            "title": "Ganancias por mercado",
            "body": "Aquí encontrarás las 💰 ganancias de colágeno según el país que estás trabajando."
          }
        ]
      },
      {
        "type": "link",
        "title": "Ganancias por mercado",
        "url": "https://photos.app.goo.gl/UMpnxp2bqD5M5qSb9",
        "actionLabel": "Abrir",
        "description": "Ganancias de Collagen+ según país"
      },
      {
        "type": "document",
        "title": "Estudios y fichas técnicas",
        "sections": [
          {
            "title": "Papers científicos",
            "body": "Te comparto dos estudios Clínicos:\n\n✔️ El papers en ingles es una auditoria externa al producto, realizada por un laboratorio que no es el de Nu Skin, que comprueba los resultados, y emite un informe.\n\n✔️ El estudio en español es un informe realizado por Nu Skin"
          }
        ],
        "description": "Documentación técnica de Collagen+."
      },
      {
        "type": "link",
        "title": "Ficha técnica LATAM",
        "url": "/api/bot-assets/6ad525fc49b180e60b1da0b1e5b6637979ecd66f98918d060ae832ac9d3aca45.pdf",
        "actionLabel": "Abrir",
        "description": "(AR) Beauty-Focus-Collagen Plus-PIP.pdf"
      },
      {
        "type": "link",
        "title": "Ficha técnica Europa",
        "url": "/api/bot-assets/a2032b0a402fbb73742f1f864c791b7585c1c01ca933e33fc832a9eac20c0798.pdf",
        "actionLabel": "Abrir",
        "description": "beauty-focus-collagen-plus-pip-es.pdf"
      },
      {
        "type": "link",
        "title": "Paper científico en inglés",
        "url": "/api/bot-assets/ac22f70433e35e0e104bcb1e030a313ac37a47913b920f34977ef2631c5c46a2.pdf",
        "actionLabel": "Abrir",
        "description": "NS - Estudio Científico Collagen+.pdf"
      },
      {
        "type": "link",
        "title": "Estudio en español",
        "url": "/api/bot-assets/0b8e1af100bb4914db51b7ef889664777844ccb6f662d211e708ffcac39a2930.pdf",
        "actionLabel": "Abrir",
        "description": "beauty-focus-collagen-plus-clinical-bulletin-spanish.pdf"
      }
    ],
    "sourceFlow": "BOX COLAGENO OK"
  },
  {
    "id": "asesorar-lumispa",
    "title": "Cómo asesorar LumiSpa",
    "command": "como asesorar lumi spa",
    "commands": [
      "como asesorar lumispa"
    ],
    "aliases": [
      "asesorar lumi",
      "asesorar lumispa",
      "asesoria lumispa",
      "vender lumispa"
    ],
    "phrases": [
      "como asesoro lumispa",
      "como vender lumispa",
      "como le explico lumispa a una clienta",
      "que le digo a una clienta de lumispa"
    ],
    "keywords": [
      "lumispa",
      "asesorar",
      "cliente",
      "cierre",
      "promo",
      "antes y despues"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Mini manual de ManyChat para acompañar una conversación de asesoramiento de LumiSpa."
      },
      {
        "type": "document",
        "title": "Cómo asesorar LumiSpa",
        "sections": [
          {
            "title": "MINI MANUAL LUMISPA 🫶🏼💙",
            "body": "MINI MANUAL LUMISPA 🫶🏼💙\n\nMensaje 1 — Inicio\nIniciar conversación, saber más de la clienta, si tiene una rutina de limpieza ahora mismo. Por qué le interesó?\n\nEjemplo:\nHola hermosa! 💙 Antes de pasarte todo, contame:\n¿Tenés alguna rutina de limpieza ahora?\n¿Y qué te gustaría mejorar de tu piel en este momento? ✨\n\n⸻ ((enseguida le podes mandar Info técnica para que tenga para leer)) 😉"
          },
          {
            "title": "Mensaje 2 — Info esencial del LumiSpa",
            "body": "Mensaje 2 — Info esencial del LumiSpa\n\nEjemplo:\nMientras me respondés, te dejo lo básico del LumiSpa 💦✨\n\nEs un dispositivo que:\nLimpia y trata la piel en 2 minutos\nSe usa bajo la ducha\nMejora textura, poros y luminosidad\nEs suave, práctico e higiénico\nDa resultados visibles desde la primera semana\nTiene 8 beneficios en 1 solo paso\n(este msj placa con beneficios que te envío más abajo)\n\n⸻ ESPERAR RESPUESTA ‼️"
          },
          {
            "title": "Mensaje 3 — Antes y después",
            "body": "Mensaje 3 — Antes y después\n🔥 Te dejo antes/después real de clientas para que veas la diferencia.\n\nEn este DRIVE encontrarás un montón de antes y después que podes usar para enviar a tus clientes\n\n⸻"
          },
          {
            "title": "Mensaje 4 —",
            "body": "Mensaje 4 —\n\nCierre + Asesoramiento\n¿Tenés alguna duda hasta acá?\n\nSino ya te paso la promo que tengo vigente ahora mismo  🫶🏼\n\n⸻ ESPERAS RESPUESTA Y LUEGO ENVÍAS PROMO CORRESPONDIENTE AL PAÍS"
          },
          {
            "title": "Mensaje 5 — Enviar promo y pregunta de Cierre",
            "body": "Mensaje 5 — Enviar promo y pregunta de Cierre\n\nTIPS IMPORTANTES ‼️\n\n- Enviar flyer con precio.\n\n- Remarcar que es la promo que tenés ahora por 24/48hs, por el fin de semana etc como quieras.\n\n- Resaltar las facilidades de pago de tu país.\n\n- Hacer pregunta de cierre:\nqué te parece hermosa? querés aprovechar la promo? Cómo te quedaría cómodo pagarlo?"
          }
        ],
        "description": "Secuencia de mensajes y cierre."
      },
      {
        "type": "link",
        "title": "Placa de apoyo LumiSpa",
        "url": "/api/bot-assets/77fa3276fe668110c078d3ee34db2a26a812bf918d2b72eeba4434dea7985f7b.jpeg",
        "actionLabel": "Abrir",
        "description": "WhatsApp Image 2025-12-03 at 13.13.22.jpeg"
      },
      {
        "type": "link",
        "title": "Antes y después de LumiSpa",
        "url": "https://drive.google.com/drive/folders/13PaUpi3_zxfYLDrg2rpfew1ARqDS7bzu?usp=sharing",
        "actionLabel": "Abrir",
        "description": "Drive con testimonios y materiales"
      }
    ],
    "sourceFlow": "Como asesorar Lumi Spa"
  },
  {
    "id": "comunidad-llamadas",
    "title": "Comunidad y llamadas",
    "command": "comunidad ok",
    "commands": [
      "llamada"
    ],
    "aliases": [
      "comunidad",
      "llamadas",
      "reuniones",
      "zoom",
      "llamadas ok"
    ],
    "phrases": [
      "como entro a la comunidad",
      "donde son las llamadas",
      "cual es el horario de las llamadas",
      "link de zoom",
      "zoom de comunidad",
      "horarios comunidad"
    ],
    "keywords": [
      "comunidad",
      "zoom",
      "horarios",
      "lunes",
      "reuniones"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Accede al video donde aprenderas a utilizar la comunidad de la mejor manera..."
      },
      {
        "type": "link",
        "title": "Cómo usar la comunidad",
        "url": "https://www.youtube.com/watch?v=DWh6Jr4XwIc",
        "actionLabel": "Abrir",
        "description": "Video tutorial",
        "resourceKind": "video"
      },
      {
        "type": "document",
        "title": "Llamadas de comunidad",
        "sections": [
          {
            "title": "Horarios y acceso",
            "body": "El encuentro es en VIVO en Comunidad y por Zoom:\n\nCHEQUEA TU HORARIO\n\n👉🏼 LUNES\n15 PM  🇪🇺 Madrid\n10 AM  🇦🇷 🇨🇱   Argentina/Chile\n8 AM  🇨🇴 🇵🇪  Cancún/Perú/Col\n7 AM  🇲🇽       CDMX\n\nÚnase a las reuniones de Zoom aquí:\n\nID de reunión: 811 8079 1343\n\nCódigo de acceso: COMUNIDAD\n\nEl link  siempre será el mismo"
          }
        ]
      },
      {
        "type": "link",
        "title": "Entrar al Zoom",
        "url": "https://us06web.zoom.us/j/81180791343?pwd=hYgMfglRgyTCYcWTMGGqOUNSSmG1Bd.1",
        "actionLabel": "Abrir",
        "description": "Link permanente de la comunidad"
      }
    ],
    "sourceFlow": [
      "comunidad ok",
      "llamadas ok"
    ]
  },
  {
    "id": "stela",
    "title": "Stela",
    "command": "stela",
    "aliases": [
      "estela",
      "app stela",
      "descargar stela"
    ],
    "phrases": [
      "donde descargo stela",
      "como descargar stela",
      "necesito la app stela"
    ],
    "keywords": [
      "android",
      "iphone",
      "app",
      "aplicacion"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Descargá Stela según tu dispositivo:"
      },
      {
        "type": "link",
        "title": "Stela · Android",
        "url": "https://play.google.com/store/apps/details?id=com.nuskin.sol",
        "actionLabel": "Abrir",
        "description": "Google Play"
      },
      {
        "type": "link",
        "title": "Stela · iPhone",
        "url": "https://apps.apple.com/es/app/nu-skin-stela/id1569407043",
        "actionLabel": "Abrir",
        "description": "App Store"
      }
    ],
    "sourceFlow": "STELA"
  },
  {
    "id": "vera",
    "title": "Vera",
    "command": "vera",
    "aliases": [
      "app vera",
      "descargar vera"
    ],
    "phrases": [
      "donde descargo vera",
      "como descargar vera",
      "necesito la app vera"
    ],
    "keywords": [
      "android",
      "iphone",
      "app",
      "aplicacion"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Descargá Vera según tu dispositivo:"
      },
      {
        "type": "link",
        "title": "Vera · Android",
        "url": "https://play.google.com/store/apps/details?id=com.nuskin.vera",
        "actionLabel": "Abrir",
        "description": "Google Play"
      },
      {
        "type": "link",
        "title": "Vera · iPhone",
        "url": "https://apps.apple.com/es/app/nu-skin-vera/id1569408041",
        "actionLabel": "Abrir",
        "description": "App Store"
      }
    ],
    "sourceFlow": "VERA"
  },
  {
    "id": "crear-oferta",
    "title": "Crear una oferta",
    "command": "crear una oferta",
    "aliases": [
      "oferta",
      "crear oferta",
      "hacer una oferta",
      "oferta stela"
    ],
    "phrases": [
      "como creo una oferta",
      "como hacer una oferta en stela",
      "quiero crear una oferta",
      "como armo una oferta"
    ],
    "keywords": [
      "stela",
      "oferta",
      "producto",
      "lumispa"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "🗨️Excelente !!! ya te envío un enlace para que aprendas a  crear la oferta de tu producto.\nLos pasos del siguiente video es con el dispositivo LUMI SPA, pero puedes aplicar una oferta con cualquier producto...\n\nVamos a ello💪"
      },
      {
        "type": "link",
        "title": "Tutorial · Crear una oferta",
        "url": "https://www.youtube.com/watch?v=rRPg_-xCEzo&feature=youtu.be",
        "actionLabel": "Abrir",
        "description": "El ejemplo usa LumiSpa, pero el procedimiento puede aplicarse a otros productos.",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "OFERTA"
  },
  {
    "id": "crear-nuevo-id",
    "title": "Crear nuevo ID",
    "command": "crear nuevo id",
    "aliases": [
      "nuevo id",
      "crear id",
      "nuevo cliente",
      "dar de alta id"
    ],
    "phrases": [
      "como creo un nuevo id",
      "como crear un id",
      "como doy de alta un cliente",
      "crear id de cliente"
    ],
    "keywords": [
      "cliente",
      "miembro",
      "afiliado",
      "alta"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "🤖💬Vamos a ver un video de como generar  ID a un nuevo cliente / miembro o afiliado"
      },
      {
        "type": "link",
        "title": "Tutorial · Crear nuevo ID",
        "url": "/api/bot-assets/03730b48c8edecdce583e806d3d7f435e482ea58ac158982f8e7a69977c2a265.mp4",
        "actionLabel": "Abrir",
        "description": "Alta de cliente, miembro o afiliado",
        "resourceKind": "video"
      },
      {
        "type": "text",
        "content": "Te recomiendo pedirle a la persona, los datos que te solicita el formulario para darla de alta tú!\n\nLuego le envías el usuario y contraseña que creaste para que pueda realizar su compra 😉"
      }
    ],
    "sourceFlow": "NUEVO ID"
  },
  {
    "id": "navegar-pagina",
    "title": "Navegar página",
    "command": "navegar pagina",
    "aliases": [
      "navegar página",
      "navegar web",
      "pagina nuskin",
      "página nuskin",
      "web nuskin"
    ],
    "phrases": [
      "como navegar la pagina",
      "como navegar la página",
      "como busco precios en nuskin",
      "como veo el stock",
      "donde veo los puntos de un producto"
    ],
    "keywords": [
      "nuskin.com",
      "stock",
      "precios",
      "puntos",
      "web"
    ],
    "blocks": [
      {
        "type": "text",
        "content": "Te comparto este tutorial para aprender a navegar la página web, a encontrar los precios, a saber si hay Stock, cuántos puntos da un producto, etc.\n\n😉 espero que te sirva!!!"
      },
      {
        "type": "link",
        "title": "Tutorial · Navegar la página",
        "url": "https://youtu.be/EZmxBEfsm5M",
        "actionLabel": "Abrir",
        "description": "Precios, stock, puntos y navegación.",
        "resourceKind": "video"
      }
    ],
    "sourceFlow": "navegar pagina"
  }
];

  window.BotCommandCatalog = [
  {
    "command": "loi",
    "topicId": "loi",
    "label": "LOI"
  },
  {
    "command": "tramites",
    "topicId": "tramites",
    "label": "Trámites"
  },
  {
    "command": "primera venta",
    "topicId": "primera-venta",
    "label": "Primera venta"
  },
  {
    "command": "info argentina",
    "topicId": "info-argentina",
    "label": "Info Argentina"
  },
  {
    "command": "estrategia colageno europa",
    "topicId": "estrategia-colageno-europa",
    "label": "Estrategia Colágeno Europa"
  },
  {
    "command": "como usar",
    "topicId": "como-usar",
    "label": "Cómo usar"
  },
  {
    "command": "box colageno",
    "topicId": "box-colageno",
    "label": "Box Colágeno"
  },
  {
    "command": "como asesorar lumi spa",
    "topicId": "asesorar-lumispa",
    "label": "Cómo asesorar LumiSpa"
  },
  {
    "command": "comunidad ok",
    "topicId": "comunidad-llamadas",
    "label": "Comunidad"
  },
  {
    "command": "llamada",
    "topicId": "comunidad-llamadas",
    "label": "Llamadas"
  },
  {
    "command": "stela",
    "topicId": "stela",
    "label": "Stela"
  },
  {
    "command": "vera",
    "topicId": "vera",
    "label": "Vera"
  },
  {
    "command": "crear una oferta",
    "topicId": "crear-oferta",
    "label": "Crear una oferta"
  },
  {
    "command": "crear nuevo id",
    "topicId": "crear-nuevo-id",
    "label": "Crear nuevo ID"
  },
  {
    "command": "navegar pagina",
    "topicId": "navegar-pagina",
    "label": "Navegar página"
  }
];
})();
