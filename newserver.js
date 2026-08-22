const express = require('express');
const app = express();
app.use(express.json());
const crypto = require('crypto');

// API KEY ANON LARGA DE SUPABASE
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_HOME = process.env.SUPABASE_HOME;
const SUPABASE_HIST = process.env.SUPABASE_HISTORIAL;
const SUPABASE_MAST = process.env.SUPABASE_MASTER;
const SUPABASE_DISP = process.env.SUPABASE_DISPONIBLES;
const SUPABASE_ACTI = process.env.SUPABASE_ACTIVADAS;  


//*********************************************************************************************************
// =====================================================================
// NUEVA RUTA RAÍZ (/): AHORA LA URL LIMPIA SÍ SIFRA Y DESPIERTA SUPABASE
// =====================================================================
app.get('/', async (req, res) => {
    try {
        // Usamos exactamente tu misma lógica de urlBase de la Parte 1
        const urlBase = SUPABASE_HOME + "?clave=eq.";
        
        // Hacemos una consulta tonta de limit=1 para forzar el movimiento de PostgreSQL
        const urlDespertador = urlBase + "clave_despertador" + "&select=clave&limit=1";

        const response = await fetch(urlDespertador, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            console.log("¡ÉXITO! Supabase despertado desde la raíz limpia por visita web.");
            return res.status(200).send("Servidor Activo y Base de Datos de Supabase Despierta.");
        } else {
            return res.status(500).send("Servidor responde, pero Supabase dio alerta.");
        }

    } catch (error) {
        return res.status(500).send("Error de comunicación: " + error.message);
    }
});

//*********************************************************************************************************

app.get('/validar-clave', async (req, res) => {
    const { clave } = req.query;

    if (!clave) {
        return res.status(400).json({ activa: false, error: "Clave no proporcionada" });
    }

    try {
        // 1. Solicitamos los campos necesarios de la tabla licencias
        const urlBase = SUPABASE_HOME + "?clave=eq.";
        const urlFetch = urlBase + encodeURIComponent(clave) + "&select=activa,bloqueada,vencimiento,consultas_diarias";
       
        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // Si la clave no existe en la base de datos
        if (!data || data.length === 0) {
            return res.json({ activa: false, motivo: "Licencia inexistente" });
        }

        const registro = data[0];
        
        // OBTENEMOS LA FECHA ACTUAL DEL SERVIDOR EN FORMATO YYYY-MM-DD
        const hoy = new Date().toISOString().split('T')[0];
        // --- NUEVO: OBTENEMOS LA HORA ACTUAL EN FORMATO HH:MM:SS ---
        const hora = new Date().toTimeString().split(' ')[0];        

        // 2. CONTROL DE BLOQUEO INMEDIATO
        if (registro.bloqueada === true) {
            return res.json({ activa: false, motivo: "Licencia bloqueada por el administrador" });
        }

        // 3. CONTROL DE FECHA DE VENCIMIENTO
        if (registro.vencimiento) {
            const fechaVencimiento = new Date(registro.vencimiento).toISOString().split('T')[0];
            if (hoy > fechaVencimiento) {
                return res.json({ activa: false, motivo: "Licencia expirada" });
            }
        }

        // 4. CONTROL DE CONTADOR DE CONSULTAS DIARIAS (JSONB)
        let historial = registro.consultas_diarias || {};
        
        // ¡TRUCO DE INVISIBILIDAD!: Si NO es una consulta de reporte, sumamos +1 y actualizamos Supabase
        if (req.query.reporte !== "true") {
            
            // Si es la primera consulta del día, inicializamos en 1, si no, le sumamos +1
            if (historial[hoy]) {
                historial[hoy] = historial[hoy] + 1;
            } else {
                historial[hoy] = 1;
            }
            // CAPTURA AUTOMÁTICA DE IP Y RIF
            // req.headers['x-forwarded-for'] toma la IP de internet real del cliente a través de Render
            const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const rifCliente = req.query.rif || "No proporcionado";
            
            // Enviamos la actualización del contador de vuelta a Supabase
            const urlUpdate = urlBase + encodeURIComponent(clave) ;
            await fetch(urlUpdate, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': "Bearer " + SUPABASE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                // ¡AQUÍ SUMAMOS LOS NUEVOS CAMPOS PARA ACTUALIZAR EN SUPABASE!
                body: JSON.stringify({ 
                    consultas_diarias: historial,
                    ultima_ip: ipCliente,
                    rif_empresa: rifCliente
                })
            });
            // C) ¡LA IDEA FABULOSA!: Insertamos un registro de auditoría en la nueva tabla historial_accesos
            const urlHistorial = SUPABASE_HIST;
            await fetch(urlHistorial, {
                method: 'POST', // POST sirve para insertar filas nuevas
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': "Bearer " + SUPABASE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ 
                    clave: clave,
                    rif: rifCliente,
                    ip: ipCliente,
                    hora: hora
                    // La columna 'fecha' se llena sola en Supabase con la fecha actual
                })
            });            
        }

        // 5. RESPUESTA FINAL SI TODO ESTÁ CORRECTO
        // Evaluamos si el campo general 'activa' de la tabla también es true
       //  POR ESTE BLOQUE INTEGRAL PARA REPORTES:
       if (registro.activa === true) {
            
            // 1. Tomamos el objeto consultas_diarias (ej: {"2026-07-30":51})
            const historialCrudo = registro.consultas_diarias || {};
            
            // 2. Lo transformamos en un arreglo estructurado [{fecha: "...", cantidad: ...}]
            const arregloFormateado = Object.entries(historialCrudo).map(([fechaKey, cantidadValue]) => {
                return {
                    fecha: fechaKey,
                    cantidad: cantidadValue
                };
            });

            // 3. Enviamos el JSON con el nuevo diseño limpio
            return res.json({ 
                activa: true, 
                vencimiento: registro.vencimiento, 
                bloqueada: registro.bloqueada, 
                consultas_diarias: arregloFormateado 
            });
} else {
    return res.json({ activa: false, motivo: "Licencia inactiva" });
}

    } catch (error) {
        console.error("Error general en el servidor:", error);
        return res.status(500).json({ activa: false, error: "Error interno del servidor" });
    }
});
// ************************************************************************************************************
// =================================================================
// NUEVA RUTA: REPORTE GENERAL (TRAE ACTIVAS, INACTIVAS, UNA O TODAS)
// =================================================================
app.get('/reporte-general', async (req, res) => {
    const { clave } = req.query; // Si viene vacía, traerá todas

    try {
        // 1. Construimos la URL de Supabase de forma inteligente
        let urlFetch = SUPABASE_HOME + "?";
        
        // Si el usuario especificó una clave en FoxPro, filtramos solo esa; si no, trae todas
        if (clave) {
            urlFetch += "&clave=eq." + encodeURIComponent(clave);
        }

        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // 2. Procesamos y formateamos el arreglo de registros (uno o muchos)
        const resultadoFinal = data.map(registro => {
            const historialCrudo = registro.consultas_diarias || {};
            
            // Transformamos el objeto consultas_diarias a tu arreglo deseado [{fecha, cantidad}]
            const arregloFormateado = Object.entries(historialCrudo).map(([fechaKey, cantidadValue]) => {
                return {
                    fecha: fechaKey,
                    cantidad: cantidadValue
                };
            });

            // Devolvemos el registro completo sin importar si activa es true o false
            return {
                clave: registro.clave,
                activa: registro.activa,
                bloqueada: registro.bloqueada,
                vencimiento: registro.vencimiento,
                consultas_diarias: arregloFormateado
            };
        });

        // 3. Respondemos con la lista de licencias procesadas
        return res.json({ licencias: resultadoFinal });

    } catch (error) {
        console.error("Error en reporte general:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
});
// *********************************************************************************************
// =================================================================
// NUEVA RUTA: AUDITORÍA COMPLETA (TRAE EL HISTORIAL PLANO DE LOGS)
// =================================================================
app.get('/auditoria-completa', async (req, res) => {
    const { clave } = req.query;

    try {
        // Apuntamos directamente a la nueva tabla de logs ordenando por id descendente (los más recientes primero)
        let urlFetch = SUPABASE_HIST + "?";
        
        // Si desde FoxPro pides auditar una licencia específica, filtramos; si no, trae todo
        if (clave) {
            urlFetch += "&clave=eq." + encodeURIComponent(clave);
        }

        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        // Enviamos la lista plana de registros directamente a FoxPro
        return res.json({ logs: data });

    } catch (error) {
        console.error("Error en auditoría completa:", error);
        return res.status(500).json({ error: "Error interno" });
    }
});
// =====================================================================
// DESPERTADOR SECRETO: CONECTADO A TU URLBASE DE SUPABASE (FETCH)
// =====================================================================
app.get('/despertador-secreto-licencias', async (req, res) => {
    try {
        // --- REPARADO EN BASE A TU CÓDIGO REAL: USAMOS TU MISMA RUTA DE LA PARTE 1 ---
        const urlBase = SUPABASE_HOME+"?clave=eq.";
        
        // Consultamos un registro común (limit=1) para forzar el movimiento de la base de datos relacional
        const urlDespertador = urlBase + "clave_despertador" + "&select=clave&limit=1";

        // Ejecutamos tu estructura de comandos fetch original con tu constante SUPABASE_KEY
        const response = await fetch(urlDespertador, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        // Si la base de datos de PostgreSQL respondió de forma correcta (Códigos de éxito 2xx)
        if (response.ok) {
            console.log("¡ÉXITO! Supabase ha sido despertado de forma forzada por Cron-Job.");
            return res.status(200).send("Base de datos de Supabase Despierta y Operativa.");
        } else {
            const txtError = await response.text();
            console.error("Supabase rechazó la petición del despertador:", txtError);
            return res.status(500).send("Supabase respondió con alerta: " + txtError);
        }

    } catch (error) {
        console.error("Fallo crítico en el despertador de red:", error);
        return res.status(500).send("Error de comunicación en Render: " + error.message);
    }
});
// =====================================================================
// CORREGIDO: REGISTRAR LICENCIA MAESTRA - BLINDAJE DE SERIAL (POST)
// =====================================================================
app.post('/registrar-master', async (req, res) => {
    const { rif, licencia, activa, bloqueada } = req.body;

    if (!rif || !licencia) {
        return res.status(400).json({ registrado: false, error: "El RIF y la Licencia (Serial) son obligatorios." });
    }

    try {
        const lcRif = rif.trim().toUpperCase();
        const lcLicencia = licencia.trim();
        console.log(`Validando propiedad de Serial único: ${lcLicencia}...`);

        // 1. INTERROGAMOS A SUPABASE PARA VER SI LA LICENCIA YA EXISTE
        const urlCheck = SUPABASE_MAST + `?licencia=eq.${encodeURIComponent(lcLicencia)}`;
        
        const responseCheck = await fetch(urlCheck, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataCheck = await responseCheck.json();

        // 2. EL CANDADO DE CONTROL DE PIRATERÍA CORREGIDO
        if (Array.isArray(dataCheck) && dataCheck.length > 0) {
            // --- REMACHE SEGURO: Extraemos con total precisión la fila cero ---
            const registroExistente = dataCheck[0]; 
            
            // Caso A: Es exactamente el mismo RIF con el mismo Serial (Re-registro inofensivo)
            if (registroExistente.rif === lcRif) {
                console.log(`ℹ️ El RIF ${lcRif} ya tiene asignada esta misma licencia.`);
                return res.json({ 
                    registrado: false, 
                    motivo: "DUPLICADO", 
                    error: "Esta licencia ya se encuentra asignada y activa para su empresa." 
                });
            } else {
                // Caso B: Es un RIF NUEVO intentando clonar el Serial de OTRA empresa (¡PIRATERÍA!)
                console.log(`⛔ INTENTO DE CLONACIÓN: El RIF ${lcRif} intentó usar el Serial de ${registroExistente.rif}`);
                return res.json({ 
                    registrado: false, 
                    motivo: "DUPLICADO", 
                    error: "Registro inválido. Esta licencia ya fue activada previamente por otra empresa." 
                });
            }
        }

        // 3. SI EL SERIAL ESTÁ LIBRE, SE PROCEDE A INSERTAR LA NUEVA FILA
        const payloadMaster = {
            rif: lcRif,
            licencia: lcLicencia,
            activa: activa !== undefined ? activa : true,
            bloqueada: bloqueada !== undefined ? bloqueada : false
        };

        const responseSupabase = await fetch(SUPABASE_MAST, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payloadMaster)
        });

        if (responseSupabase.ok) {
            console.log(`¡Éxito! Licencia única vinculada al RIF ${lcRif} guardada en MASTER.`);
            return res.status(200).json({ registrado: true, mensaje: "Licencia maestra creada exitosamente." });
        } else {
            const errorTxt = await responseSupabase.text();
            console.error("Supabase rechazó la inserción física:", errorTxt);
            return res.status(200).json({ registrado: false, error: "La base de datos bloqueó el registro." });
        }

    } catch (error) {
        console.error("Fallo crítico controlado en ruta registrar-master:", error);
        // Atajamos cualquier pánico de hardware y respondemos con status 200 para que VFP lea el JSON sin reventarse
        return res.status(200).json({ registrado: false, error: "Conflicto contido de datos: " + error.message });
    }
});
// =====================================================================
// 1. EMBUDO DE ACTIVACIÓN MULTI-ESTACIÓN CON ANCLA DE HARDWARE (POST)
// =====================================================================
app.post('/activar-licencia-online', async (req, res) => {
    const { licencia, rif, nombre_pc } = req.body;

    if (!licencia || !rif || !nombre_pc) {
        return res.status(400).json({ activada: false, error: "Licencia, RIF y Nombre de PC son obligatorios." });
    }

    try {
        const lcLicencia = licencia.trim();
        const lcRifBase = rif.trim().toUpperCase();
        const lcNombrePc = nombre_pc.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        
        // Cadena combinada de ancla única por máquina
        const lcRifCombinado = lcRifBase + "-" + lcNombrePc;
        
        console.log("🤖 Evaluando cupos para Licencia: " + lcLicencia + ", Estación: " + lcRifCombinado + "...");

        // A. VERIFICAR QUE EL SERIAL EXISTA EN TU STOCK DE DISPONIBLES
        const urlCheckStock = process.env.SUPABASE_DISPONIBLES + "?licencia=eq." + encodeURIComponent(lcLicencia);
        const responseStock = await fetch(urlCheckStock, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json' }
        });

        const dataStock = await responseStock.json();

        if (!dataStock || dataStock.length === 0 || !Array.isArray(dataStock)) {
            return res.json({ activada: false, motivo: "INEXISTENTE", error: "El número de licencia proporcionado no es válido." });
        }

        const registroStock = dataStock; 

        if (registroStock.status === true) {
            return res.json({ activada: false, motivo: "YA_ASIGNADO", error: "Esta licencia ya alcanzó el máximo de activaciones permitidas." });
        }

        const maxEstaciones = registroStock.limite_estaciones !== undefined ? parseInt(registroStock.limite_estaciones) : 1;

        // =====================================================================
        // TRUCO DE HARDWARE: VALIDAMOS SI ESTA PC ESPECÍFICA YA ESTÁ ACTIVADA
        // =====================================================================
        const urlCheckDuplicado = process.env.SUPABASE_ACTIVADAS + "?and=(licencia.eq." + encodeURIComponent(lcLicencia) + ",rifasociado.eq." + encodeURIComponent(lcRifCombinado) + ")";
        const responseDuplicado = await fetch(urlCheckDuplicado, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json' }
        });
        const dataDuplicado = await responseDuplicado.json();

        // ¡EL REBOTE DE DUPLICIDAD! Si esta PC ya existe, le damos luz verde comercial sin gastar cupo
        if (dataDuplicado && dataDuplicado.length > 0 && Array.isArray(dataDuplicado)) {
            console.log("⚠️ La estación [" + lcRifCombinado + "] ya estaba registrada. Devolviendo pase exitoso sin duplicar fila.");
            return res.status(200).json({ 
                activada: true, 
                mensaje: "Esta computadora ya se encuentra activada legítimamente en el sistema." 
            });
        }

        // B. CONTAMOS CUÁNTOS ASIENTOS TIENE OCUPADOS ESTE SERIAL ACTUALMENTE (A NIVEL GLOBAL)
        const urlCountActivadas = process.env.SUPABASE_ACTIVADAS + "?licencia=eq." + encodeURIComponent(lcLicencia) + "&select=count";
        const responseCount = await fetch(urlCountActivadas, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Prefer': 'count=exact' }
        });

        const rangoCabecera = responseCount.headers.get('content-range') || "";
        let activacionesActuales = 0;
        if (rangoCabecera.includes('/')) {
            activacionesActuales = parseInt(rangoCabecera.split('/')) || 0;
        }

        console.log("📊 Cuota Global Actual: [" + activacionesActuales + " de " + maxEstaciones + "] asientos ocupados.");

        // Candado Comercial: Si ya igualamos la cuota global, portazo por volumen
        if (activacionesActuales >= maxEstaciones) {
            return res.json({ activada: false, motivo: "CUOTA_EXCEDIDA", error: "Límite de activaciones alcanzado para esta licencia. Adquiera más asientos." });
        }

        // CÁLCULO DINÁMICO DE TU FECHA DE VENCIMIENTO
        const aniosValidez = registroStock.validez !== undefined ? parseInt(registroStock.validez) : 1;
        let fechaCalculada = new Date();
        fechaCalculada.setFullYear(fechaCalculada.getFullYear() + aniosValidez);
        const lcVencimiento = fechaCalculada.toISOString().split('T');

        // C. PROCEDER CON LA ACTIVACIÓN EN TU MAESTRO DE ACTIVADAS (Guardamos el asiento)
        const payloadActivacion = {
            licencia: lcLicencia,
            rifasociado: lcRifCombinado, 
            vencimiento: lcVencimiento,
            activa: true,
            bloqueada: false
        };

        const responseActi = await fetch(process.env.SUPABASE_ACTIVADAS, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(payloadActivacion)
        });

        if (!responseActi.ok) {
            return res.json({ activada: false, error: "La base de datos bloqueó la activación por hardware." });
        }

        // D. QUEMAR EL STOCK ÚNICAMENTE SI ACABAMOS DE LLENAR EL ÚLTIMO CUPO CONTRATADO
        if ((activacionesActuales + 1) >= maxEstaciones) {
            const idReal = registroStock.id !== undefined ? registroStock.id : registroStock.ID;
            const urlUpdateStock = process.env.SUPABASE_DISPONIBLES + "?id=eq." + idReal;
            await fetch(urlUpdateStock, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ status: true })
            });
            console.log("🔒 Licencia [" + lcLicencia + "] agotó todos sus cupos contratados.");
        }

        console.log("🚀 ¡ÉXITO MULTI-ESTACIÓN! Nueva activación registrada. Asientos: [" + (activacionesActuales + 1) + "/" + maxEstaciones + "]");
        return res.status(200).json({ activada: true, mensaje: "Licencia activada con éxito. Estación registrada." });

    } catch (error) {
        return res.status(200).json({ activada: false, error: "Error en la ráfaga de activación: " + error.message });
    }
});


// =====================================================================
// 2. EMBUDO DE VALIDACIÓN DIARIA CAPTCHASOLVER CON FILTRO DE NODO (POST)
// =====================================================================
app.post('/validar-acceso-diario', async (req, res) => {
    const { licencia, rif, nombre_pc } = req.body;

    if (!licencia || !rif || !nombre_pc) {
        return res.status(400).json({ acceso: false, error: "Licencia, RIF y Nombre de PC son requeridos." });
    }

    try {
        const lcLicencia = licencia.trim();
        const lcRifBase = rif.trim().toUpperCase();
        const lcNombrePc = nombre_pc.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        
        // Armamos la misma ancla exacta para interrogar a Supabase
        const lcRifCombinado = lcRifBase + "-" + lcNombrePc;
        
        console.log("📡 Solicitud de acceso diario -> Licencia: " + lcLicencia + ", Estación: " + lcRifCombinado + "...");

        // PASO 1: VERIFICAR EXCLUSIVAMENTE QUE EL SERIAL EXISTA EN TU STOCK
        const urlCheckStock = process.env.SUPABASE_DISPONIBLES + "?licencia=eq." + encodeURIComponent(lcLicencia);
        const responseStock = await fetch(urlCheckStock, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json' }
        });
        const dataStock = await responseStock.json();

        // Candado A: El serial no existe físicamente en tu inventario maestro
        if (!dataStock || dataStock.length === 0 || !Array.isArray(dataStock)) {
            console.log("⛔ Acceso Denegado: Licencia " + lcLicencia + " no existe en el inventario.");
            return res.json({ acceso: false, motivo: "INEXISTENTE", error: "Licencia no válida o no ha sido dada de alta." });
        }

        // =====================================================================
        // REMACHE MAESTRO: ¡PULVERIZADA LA LÍNEA DEL STATUS VIEJO!
        // El stock solo valida existencia. El control real lo hace el Paso 2 en las activadas.
        // =====================================================================
        const registroStock = dataStock[0];

        // PASO 2: VERIFICAR EN MAESTRO_LICENCIAS_ACTIVADAS (CANDADO ESTRICTO DE ESTACIÓN)
        // Filtramos por la Licencia AND la cadena combinada exacta (RIF-NombrePC)
        const urlCheckActivadas = process.env.SUPABASE_ACTIVADAS + "?and=(licencia.eq." + encodeURIComponent(lcLicencia) + ",rifasociado.eq." + encodeURIComponent(lcRifCombinado) + ")";
        const responseActivadas = await fetch(urlCheckActivadas, {
            method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json' }
        });
        const dataActivadas = await responseActivadas.json();

        // ¡EL PORTAZO A LA SEXTA MÁQUINA! Si la PC actual no está registrada para esa licencia
        if (!dataActivadas || dataActivadas.length === 0 || !Array.isArray(dataActivadas)) {
            console.log("⛔ Acceso Denegado: Estación [" + lcRifCombinado + "] no autorizada para esta licencia.");
            return res.json({ acceso: false, motivo: "RIF_INCORRECTO", error: "Esta computadora no está registrada en el sistema para usar esta licencia." });
        }

        // Extraemos el primer registro del arreglo de forma tradicional
        const registroCliente = dataActivadas[0];

        // Candado C: Estatus administrativo (activa/bloqueada)
        if (registroCliente.activa !== true || registroCliente.bloqueada === true) {
            console.log("⛔ Acceso Denegado: Estación [" + lcRifCombinado + "] se encuentra inactiva o bloqueada.");
            return res.json({ acceso: false, motivo: "SUSPENDIDA", error: "La licencia se encuentra inactiva o bloqueada por el administrador." });
        }

        // Candado D: Vigencia cronológica (Comparación de fechas en la RAM)
        const hoy = new Date().toISOString().split('T')[0];
        if (registroCliente.vencimiento) {
            if (hoy > registroCliente.vencimiento) {
                console.log("⛔ Acceso Denegado: Estación [" + lcRifCombinado + "] se encuentra vencida.");
                return res.json({ acceso: false, motivo: "VENCIDA", error: "La licencia se encuentra vencida. Por favor, renueve su suscripción." });
            }
        }

        // PASO 3: TODO EN ORDEN -> REGISTRAMOS LA BITÁCORA CON EL NODO ESPECÍFICO
        const ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
        const payloadAcceso = {
            licencia: lcLicencia,
            rifasociado: lcRifCombinado, // Estampamos RIF-NombrePC en el historial de accesos
            ipaddress: ipCliente
        };

        await fetch(process.env.SUPABASE_ACCESOS, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': "Bearer " + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(payloadAcceso)
        });

        console.log("🚀 ¡LUZ VERDE! Acceso concedido a Estación: " + lcRifCombinado);
        return res.status(200).json({ acceso: true, mensaje: "Validación exitosa. Licencia autorizada." });

    } catch (error) {
        console.error("❌ Fallo crítico en protocolo de validación diaria:", error);
        return res.status(200).json({ acceso: false, error: "Error en protocolo de validación: " + error.message });
    }
});
            


// =====================================================================
// DEFINITIVO: GENERACIÓN ONLINE DE LICENCIA CON AUDITORÍA DE STOCK (POST)
// =====================================================================
app.post('/generar-licencia-online', async (req, res) => {
    const { lcRif, lcNombre, lcLic, lcFin } = req.body;

    if (!lcRif || !lcNombre || !lcLic || !lcFin) {
        return res.status(400).json({ exito: false, error: "Faltan parámetros obligatorios en la ráfaga emisor." });
    }

    try {
        const lcLicenciaAValidar = lcLic.trim();
        console.log("📡 Auditando inventario en Supabase para el Serial: " + lcLicenciaAValidar + "...");

        // ---------------------------------------------------------------------
        // NUEVO: INTERROGAMOS A TU TABLA DE DISPONIBLES EN SUPABASE
        // ---------------------------------------------------------------------
        const urlCheckStock = process.env.SUPABASE_DISPONIBLES + "?licencia=eq." + encodeURIComponent(lcLicenciaAValidar);
        const responseStock = await fetch(urlCheckStock, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const dataStock = await responseStock.json();

        // Candado 1: El serial no existe en tus lotes dados de alta
        if (!dataStock || dataStock.length === 0 || !Array.isArray(dataStock)) {
            console.log("⛔ FRAUDE DETECTADO: El emisor intentó firmar una licencia inexistente: " + lcLicenciaAValidar);
            return res.json({ exito: false, error: "Operación rechazada: El número de licencia no existe en el inventario maestro." });
        }

        const registroStock = dataStock;

        // Candado 2: La licencia ya fue vendida y consumió todos sus asientos en el pasado
        if (registroStock.status === true) {
            console.log("⛔ FRAUDE DETECTADO: El emisor intentó re-vender una licencia ya agotada: " + lcLicenciaAValidar);
            return res.json({ exito: false, error: "Operación rechazada: Esta licencia ya fue asignada previamente y no tiene cupos libres." });
        }

        // =====================================================================
        // SI PASÓ LOS DOS CANDADOS: PROCEDEMOS CON EL SELLADO ASIMÉTRICO RSA
        // =====================================================================
        const licenseData = "rif: " + lcRif.trim() + ";" + "nombre: " + lcNombre.trim() + ";" + "licencia: " + lcLicenciaAValidar + ";" + "expira: " + lcFin.trim() + ";";
        console.log("🔐 Generando sello criptográfico para: " + licenseData);

        const dataBytes = Buffer.from(licenseData, 'utf8');
        const xmlPrivateKey = process.env.RSA_PRIVATE_KEY;

        if (!xmlPrivateKey) {
            return res.status(500).json({ exito: false, error: "Llave privada RSA_PRIVATE_KEY ausente en Render." });
        }

        // =====================================================================
        // REMACHE MAESTRO DE HARDWARE: EXTRACTOR INDEXADO EN EL INDICE 1 (STRINGS)
        // =====================================================================
        const extractField = (field) => {
            const regex = new RegExp("<" + field + ">([^<]+)</" + field + ">");
            const match = xmlPrivateKey.match(regex);
            
            // Evaluamos si el match existe y si tiene la posición 1 capturada,
            // a esa sub-cadena de texto limpio SÍ le aplicamos el .trim() nativo
            return (match && match[1]) ? match[1].trim() : null;
        };
        

        const modulus = extractField("Modulus");
        const exponent = extractField("Exponent");
        const d = extractField("D");
        const p = extractField("P");
        const q = extractField("Q");
        const dp = extractField("DP");
        const dq = extractField("DQ");
        const qi = extractField("InverseQ");

        if (!modulus || !d || !exponent || !p || !q || !dp || !dq || !qi) {
            return res.status(500).json({ exito: false, error: "Estructura XML de la llave privada corrupta en Render." });
        }

        // Traductor nativo a base64url strings para JWK
        const toBase64Url = (base64Str) => {
            return Buffer.from(base64Str, 'base64').toString('base64url');
        };

        const rsaPrivateKeyPem = crypto.createPrivateKey({
            key: {
                kty: 'RSA',
                n: toBase64Url(modulus),
                e: toBase64Url(exponent),
                d: toBase64Url(d),
                p: toBase64Url(p),
                q: toBase64Url(q),
                dp: toBase64Url(dp),
                dq: toBase64Url(dq),
                qi: toBase64Url(qi)
            },
            format: 'jwk'
        });

        // Ejecutamos el firmado digital
        const firmador = crypto.createSign('RSA-SHA256');
        firmador.update(dataBytes);
        firmador.end();
        const signatureBytes = firmador.sign(rsaPrivateKeyPem);

        const base64Data = dataBytes.toString('base64');
        const base64Signature = signatureBytes.toString('base64');
        const licenseFileContent = base64Data + "." + base64Signature;

        console.log("✅ Licencia firmada con éxito. Verificada contra inventario.");

        return res.status(200).json({
            exito: true,
            licenseFileContent: licenseFileContent
        });

    } catch (error) {
        console.error("❌ Fallo crítico en el soplete criptográfico de Render:", error);
        return res.status(500).json({ exito: false, error: "Error en el servidor: " + error.message });
    }
});
// =====================================================================
// ENDPOINT AUXILIAR: HACK DE DESPERTAR CON VARIABLE INDEPENDIENTE (ALL)
// =====================================================================
app.all('/despertar-bunker-online', async (req, res) => {
    console.log("📡 Ráfaga Keep-Alive recibida [" + req.method + "]. Despertando clúster rifonline...");
    
    try {
        // Jalamos directamente tu nueva variable de entorno limpia de Render
        const urlTablaKeep = process.env.SUPABASE_KEEPALIVE;

        if (!urlTablaKeep) {
            throw new Error("Configuración incompleta: Variable SUPABASE_KEEPALIVE ausente en Render.");
        }

        // 1. FORZAMOS UNA INSERCIÓN REAL EN EL DISCO (Reinicia el conteo de pausa a cero)
        const responseInsert = await fetch(urlTablaKeep, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ }) // Inserta una fila vacía con ID y Fecha autogenerados
        });

        if (!responseInsert.ok) {
            const txtErr = await responseInsert.text();
            console.error("Supabase rechazó el insert. Detalle:", txtErr);
            throw new Error("El clúster de rifonline rechazó la inserción de control.");
        }

        // 2. AUTO-LIMPIEZA: Vaciamos la tabla de inmediato para dejarla en cero bytes
        await fetch(urlTablaKeep + "?id=gt.0", {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY
            }
        });

        console.log("🔥 Motor PostgreSQL de rifonline operó con éxito. Reloj de inactividad reseteado.");
        
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send("<h3>🏆 ¡Proyecto RIFONLINE Despierto!</h3><p>El motor PostgreSQL registró la ráfaga de escritura de forma legítima en tu tabla keep_alive.</p>");

    } catch (error) {
        console.error("❌ Alerta en el keep-alive por API:", error.message);
        return res.status(500).send("Alerta de control: " + error.message);
    }
});
// *--*
// =====================================================================
// ENDPOINT PERFECTO: BÚSQUEDA SEGURA EN TABLA CLIENTES (POST)
// =====================================================================
app.post('/api/clientes/buscar', async (req, res) => {
    const { clave } = req.body;

    if (!clave) {
        return res.status(400).json({ encontrado: false, error: "la cedula es requerida." });
    }

    try {
        // Apuntamos a tu tabla clientes real filtrando estrictamente por la columna cedula
        const urlTablaClientes = process.env.SUPABASE_CLIENTES;
        const urlFetch = urlTablaClientes + encodeURIComponent(clave.trim());
        
        const response = await fetch(urlFetch, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data && data.length > 0 && Array.isArray(data)) {
            const registro = data[0]; // Aislamos la fila cero encontrada
            console.log("🎯 registro localizado en la tabla clientes para cedula: " + clave);
            return res.status(200).json({
                encontrado: true,
                campo1: registro.nombre || "",
                campo2: registro.telefono || "",
                campo3: registro.direccion || ""
            });
        } else {
            console.log("ℹ️ cedula libre (no existe en tabla clientes): " + clave);
            return res.status(200).json({ encontrado: false });
        }

    } catch (error) {
        console.error("❌ error en la busqueda de clientes:", error.message);
        return res.status(500).json({ encontrado: false, error: error.message });
    }
});

// =====================================================================
// ENDPOINT PERFECTO: GUARDADO CON FILTRO DE CONFLICTO DE CÉDULA (POST)
// =====================================================================
app.post('/api/clientes/guardar', async (req, res) => {
    // Recibimos los 4 parámetros exactos desde el JSON de FoxPro
    const { clave, campo1, campo2, campo3 } = req.body;

    if (!clave) {
        return res.status(400).json({ exito: false, error: "la cedula es obligatoria." });
    }

    try {
        // Tu URL apunta estrictamente a tu nueva tabla 'clientes' en minúsculas
        // Le inyectamos el parámetro on_conflict=cedula para avisarle a Postgres cuál es el candado único
        const urlTablaClientes = process.env.SUPABASE_CLIENTES;

        // Mapeo idéntico a las columnas físicas de tu base de datos
        const payloadSupabase = {
            cedula: clave.trim(), 
            nombre: campo1.trim(),
            telefono: campo2.trim(),
            direccion: campo3.trim()
        };

        console.log("💾 ejecutando upsert indexado para cedula: " + clave);

        const response = await fetch(urlTablaClientes, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': "Bearer " + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal' // Modifica si existe, inserta si es nuevo
            },
            body: JSON.stringify(payloadSupabase)
        });

        if (!response.ok) {
            const txtErr = await response.text();
            console.error("supabase rechazo la escritura:", txtErr);
            return res.status(400).json({ exito: false, error: "la base de datos bloqueo la transaccion." });
        }

        console.log("✅ exito real. registro asentado en la tabla clientes.");
        return res.status(200).json({ exito: true });

    } catch (error) {
        console.error("❌ fallo critico en la compuerta de guardado:", error.message);
        return res.status(500).json({ exito: false, error: error.message });
    }
});



//**************************************************************************************************************************************
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`rifol - newserver.js 5. - Servidor corriendo en el puerto ${PORT}`);
});
