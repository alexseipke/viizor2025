const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Configuración de Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const app = express();
const PORT = 3000;

// ============================================================================
// MIDDLEWARE GLOBAL
// ============================================================================

app.use(cors());
app.use(express.json());

// Rutas estáticas
app.use('/potree', express.static(path.join(__dirname, '../potree')));
app.use('/data/converted', express.static(path.join(__dirname, '../data/converted')));

// ============================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================================================

async function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token requerido' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        // Obtener datos completos del usuario
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        req.user = userData || { 
            id: user.id, 
            email: user.email, 
            name: user.email.split('@')[0],
            plan: 'trial' 
        };
        
        next();

    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Error de autenticación' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user?.plan !== 'admin' && req.user?.id !== '15181e05-89ff-491f-a7ff-29c5aed9ff02') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere admin.' });
    }
    next();
}

// ============================================================================
// CONFIGURACIÓN DE UPLOAD
// ============================================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../data/uploads');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.las', '.laz'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos .las y .laz'));
        }
    }
});

// ============================================================================
// ENDPOINTS BÁSICOS
// ============================================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Viizor Backend'
    });
});

app.get('/test-supabase', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('count', { count: 'exact', head: true });

        if (error) throw error;

        res.json({
            status: 'Supabase connected',
            userCount: data || 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Supabase connection failed',
            details: error.message
        });
    }
});

// ============================================================================
// ENDPOINTS DE AUTENTICACIÓN
// ============================================================================

// NUEVO: Verificar si usuario existe
app.post('/auth/check-user', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email requerido' });
        }

        // Verificar en nuestra tabla de usuarios
        const { data: existingUser, error } = await supabase
            .from('users')
            .select('id, email, name')
            .eq('email', email)
            .single();

        res.json({
            success: true,
            exists: !!existingUser,
            email,
            user: existingUser || null
        });

    } catch (error) {
        console.error('Check user error:', error);
        res.status(500).json({
            error: 'Error verificando usuario',
            details: error.message
        });
    }
});

app.post('/auth/register', async (req, res) => {
    try {
        const { email, name, country, industry } = req.body;

        if (!email || !name) {
            return res.status(400).json({ error: 'Email y nombre son requeridos' });
        }

        // Verificar si ya existe
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ 
                error: 'El usuario ya está registrado. Use "Iniciar Sesión".',
                userExists: true 
            });
        }

        // Crear usuario en Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password: Math.random().toString(36),
            options: {
                data: { name }
            }
        });

        if (authError && authError.message !== 'User already registered') {
            throw authError;
        }

        // Crear perfil en nuestra tabla
        const userId = authData?.user?.id || uuidv4();
        const { data: userData, error: userError } = await supabase
            .from('users')
            .upsert([{
                id: userId,
                email,
                name,
                country,
                industry,
                plan: 'trial',
                trial_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }])
            .select()
            .single();

if (userError) {
    console.error('Error creando perfil:', userError.message);
    return res.status(500).json({
        error: 'Error creando perfil de usuario',
        details: userError.message
    });
}
        // Enviar magic link después del registro exitoso
        const { data: magicData, error: magicError } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: 'https://t.viizor.app/pro'
            }
        });

        if (magicError) {
            console.warn('Error enviando magic link:', magicError.message);
        }

        res.json({
            success: true,
            message: 'Usuario registrado. Revisa tu email para el enlace de acceso.',
            user: { id: userId, email, name }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            error: 'Error en registro',
            details: error.message
        });
    }
});

// MODIFICADO: Magic link solo para usuarios existentes  
app.post('/auth/login', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email requerido' });
        }

        // Verificar que el usuario existe
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', email)
            .single();

        if (!existingUser) {
            return res.status(404).json({ 
                error: 'Usuario no registrado. Regístrese primero.',
                userExists: false 
            });
        }

        // Enviar magic link
        const { data, error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: 'https://t.viizor.app/pro'
            }
        });

        if (error) throw error;

        res.json({
            success: true,
            message: 'Enlace de acceso enviado. Revisa tu email.',
            data
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Error en login',
            details: error.message
        });
    }
});

// MANTENER: Magic link con auto-creación (para registro)
app.post('/auth/magic-link', async (req, res) => {
    try {
        const { email, autoCreate = true } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email requerido' });
        }

        // Verificar/crear usuario si autoCreate está habilitado
        if (autoCreate) {
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, email')
                .eq('email', email)
                .single();

            if (!existingUser) {
                console.log(`Auto-creando usuario: ${email}`);

                // Crear en Supabase Auth
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email,
                    password: Math.random().toString(36),
                    options: {
                        data: { 
                            name: email.split('@')[0],
                            auto_created: true 
                        }
                    }
                });

                if (authError && authError.message !== 'User already registered') {
                    throw authError;
                }

                // Crear en nuestra tabla
                await supabase
                    .from('users')
                    .upsert([{
                        id: authData?.user?.id || uuidv4(),
                        email,
                        name: email.split('@')[0],
                        plan: 'trial',
                        trial_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                    }]);
            }
        }

        // Enviar magic link
        const { data, error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: 'https://t.viizor.app/pro'
            }
        });

        if (error) throw error;

        res.json({
            success: true,
            message: 'Magic link enviado. Revisa tu email.',
            data
        });

    } catch (error) {
        console.error('Magic link error:', error);
        res.status(500).json({
            error: 'Error enviando magic link',
            details: error.message
        });
    }
});

app.get('/auth/profile', authenticateUser, async (req, res) => {
    try {
        // Datos base del usuario
        const user = { ...req.user };
        
        // Calcular stats dinámicamente
        const convertedDir = path.join(__dirname, '../data/converted');
        let projectsCount = 0;
        let storageUsed = 0;
        
        if (fs.existsSync(convertedDir)) {
            const folders = fs.readdirSync(convertedDir);
            
            for (const folder of folders) {
                const projectPath = path.join(convertedDir, folder, 'project.json');
                if (fs.existsSync(projectPath)) {
                    try {
                        const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
                        if (projectData.userId === user.id) {
                            projectsCount++;
                            storageUsed += projectData.fileSize || 0;
                        }
                    } catch (e) {
                        // Ignore invalid project files
                    }
                }
            }
        }
        
        // Actualizar stats calculadas
        user.projects_count = projectsCount;
        user.storage_used = storageUsed;
        
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Error obteniendo perfil' });
    }
});

app.post('/auth/logout', authenticateUser, async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        await supabase.auth.signOut(token);

        res.json({
            success: true,
            message: 'Sesión cerrada exitosamente'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error en logout',
            details: error.message
        });
    }
});

// ============================================================================
// ENDPOINTS DE USUARIOS
// ============================================================================

app.put('/users/profile', authenticateUser, async (req, res) => {
    try {
        const { name, bio, website, location, industry, company } = req.body;

        const { data, error } = await supabase
            .from('users')
            .update({
                name,
                bio,
                website,
                location,
                industry,
                company,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Perfil actualizado',
            user: data
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error actualizando perfil',
            details: error.message
        });
    }
});

app.get('/users/storage', authenticateUser, (req, res) => {
    const used = req.user.storage_used || 0;
    const limit = req.user.storage_limit || 5368709120; // 5GB

    res.json({
        success: true,
        storage: {
            used,
            limit,
            percentage: Math.round((used / limit) * 100)
        }
    });
});

// ============================================================================
// ENDPOINTS DE ADMINISTRACIÓN
// ============================================================================

app.get('/admin/users', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            users: data,
            total: data.length
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error obteniendo usuarios',
            details: error.message
        });
    }
});

app.put('/admin/users/:id', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { data, error } = await supabase
            .from('users')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Usuario actualizado',
            user: data
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error actualizando usuario',
            details: error.message
        });
    }
});

app.delete('/admin/users/:id', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Eliminar de Supabase Auth
        const { error: authError } = await supabase.auth.admin.deleteUser(id);
        if (authError) {
            console.warn('Error eliminando de Auth:', authError.message);
        }

        // Eliminar de nuestra tabla
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Usuario eliminado'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error eliminando usuario',
            details: error.message
        });
    }
});

app.get('/admin/stats', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { data: users } = await supabase.from('users').select('plan');
const convertedDir = path.join(__dirname, '../data/converted');
        let projects = [];
        if (fs.existsSync(convertedDir)) {
            const folders = fs.readdirSync(convertedDir);
            const projectsCount = folders.filter(folder => {
                const projectPath = path.join(convertedDir, folder, 'project.json');
                return fs.existsSync(projectPath);
            }).length;
            // Crear array mock para que .filter() funcione
            projects = new Array(projectsCount).fill({ visibility: 'public' });
        }
        const stats = {
            users: {
                total: users?.length || 0,
                trial: users?.filter(u => u.plan === 'trial').length || 0,
                pro: users?.filter(u => u.plan === 'pro').length || 0,
                admin: users?.filter(u => u.plan === 'admin').length || 0
            },
            projects: {
                total: projects?.length || 0,
                public: projects?.filter(p => p.visibility === 'public').length || 0,
                private: projects?.filter(p => p.visibility === 'private').length || 0,
                unlisted: projects?.filter(p => p.visibility === 'unlisted').length || 0
            }
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error obteniendo estadísticas',
            details: error.message
        });
    }
});
// Lista de proyectos recientes para admin
app.get('/admin/projects', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const convertedDir = path.join(__dirname, '../data/converted');
        const projects = [];

        if (fs.existsSync(convertedDir)) {
            const folders = fs.readdirSync(convertedDir);
            
            // Obtener usuarios para mapear emails
            const { data: users } = await supabase
                .from('users')
                .select('id, email');
            
            const userMap = {};
            users?.forEach(user => {
                userMap[user.id] = user.email;
            });

            for (const folder of folders) {
                const projectPath = path.join(convertedDir, folder, 'project.json');
                if (fs.existsSync(projectPath)) {
                    try {
                        const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
                        projects.push({
                            ...projectData,
                            user_email: userMap[projectData.userId] || 'Desconocido',
                            uuid: projectData.id,
                            created_at: projectData.uploadDate,
                            status: 'ready'
                        });
                    } catch (e) {
                        // Ignorar archivos inválidos
                    }
                }
            }
        }

        // Ordenar por fecha (más recientes primero)
        projects.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

        res.json(projects);
    } catch (error) {
        console.error('Error en /admin/projects:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
// ============================================================================
// ENDPOINTS DE ARCHIVOS
// ============================================================================

app.post("/upload", authenticateUser, upload.single("pointcloud"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }

        const fileId = uuidv4();
        const originalName = req.file.originalname;
        const uploadedFilePath = req.file.path;
        const fileSize = req.file.size;

        // Crear directorio de salida
        const outputDir = path.join(__dirname, '../data/converted', fileId);
        fs.ensureDirSync(outputDir);

        // Ejecutar PotreeConverter
        const converterPath = path.join(__dirname, '../PotreeConverter/build/PotreeConverter');
        const command = `"${converterPath}" "${uploadedFilePath}" -o "${outputDir}" --overwrite`;

        exec(command, async (error, stdout, stderr) => {
            try {
                // Limpiar archivo temporal
                fs.removeSync(uploadedFilePath);

                if (error) {
                    console.error('Error en conversión:', error);
                    return res.status(500).json({
                        error: 'Error en la conversión del archivo',
                        details: stderr
                    });
                }

                // Crear HTML del viewer
                const viewerHtml = generateViewerHTML(originalName, fileId);
                const viewerPath = path.join(outputDir, 'index.html');
                fs.writeFileSync(viewerPath, viewerHtml);

                // Guardar metadata
                const metadata = {
                    userId: req.user.id,
                    id: fileId,
                    originalName,
                    fileSize,
                    uploadDate: new Date().toISOString(),
                    viewerUrl: `/data/converted/${fileId}/index.html`,
                    potreeUrl: `/data/converted/${fileId}/`
                };

                fs.writeFileSync(
                    path.join(outputDir, 'project.json'), 
                    JSON.stringify(metadata, null, 2)
                );
// Actualizar contadores automáticamente
                try {
                    const { data: currentUser } = await supabase
                        .from('users')
                        .select('projects_count, storage_used')
                        .eq('id', req.user.id)
                        .single();
                    
                    const newProjectsCount = (currentUser?.projects_count || 0) + 1;
                    const newStorageUsed = (currentUser?.storage_used || 0) + fileSize;
                    
                    await supabase
                        .from('users')
                        .update({
                            projects_count: newProjectsCount,
                            storage_used: newStorageUsed
                        })
                        .eq('id', req.user.id);
                    
                    console.log(`Contadores actualizados para usuario ${req.user.id}: ${newProjectsCount} proyectos, ${newStorageUsed} bytes`);
                } catch (updateError) {
                    console.warn('Error actualizando contadores:', updateError);
                    // No fallar el upload por error de actualización
                }

                res.json({
                    success: true,
                    fileId,
                    originalName,
                    fileSize,
                    viewerUrl: `/data/converted/${fileId}/index.html`,
                    message: 'Archivo convertido exitosamente'
                });

            } catch (cleanupError) {
                console.error('Error en cleanup:', cleanupError);
                res.status(500).json({ error: 'Error en procesamiento final' });
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get("/clouds", authenticateUser, (req, res) => {
    try {
        const convertedDir = path.join(__dirname, '../data/converted');

        if (!fs.existsSync(convertedDir)) {
            return res.json([]);
        }

        const clouds = [];
        const folders = fs.readdirSync(convertedDir);

        folders.forEach(folder => {
            const folderPath = path.join(convertedDir, folder);
            const metadataPath = path.join(folderPath, 'project.json');

            if (fs.existsSync(metadataPath)) {
                try {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    if (metadata.userId === req.user.id) { clouds.push(metadata); }
                } catch (e) {
                    console.error(`Error reading metadata for ${folder}:`, e);
                }
            }
        });

        // Ordenar por fecha (más recientes primero)
        clouds.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

        res.json(clouds);

    } catch (error) {
        console.error('Error listing clouds:', error);
        res.status(500).json({ error: 'Error al listar nubes' });
    }
});

app.delete('/clouds/:id', (req, res) => {
    try {
        const { id } = req.params;
        const cloudDir = path.join(__dirname, '../data/converted', id);
        
        if (!fs.existsSync(cloudDir)) {
            return res.status(404).json({ error: 'Nube no encontrada' });
        }
        
        // Leer metadata ANTES de eliminar para actualizar contadores
        const projectJsonPath = path.join(cloudDir, 'project.json');
        let userId = null;
        let fileSize = 0;
        
        if (fs.existsSync(projectJsonPath)) {
            try {
                const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
                userId = projectData.userId;
                fileSize = projectData.fileSize || 0;
            } catch (e) {
                console.warn('Error leyendo project.json:', e);
            }
        }
        
        // Eliminar carpeta
        fs.removeSync(cloudDir);
        
        // Actualizar contadores si tenemos userId
        if (userId) {
            supabase
                .from('users')
                .select('projects_count, storage_used')
                .eq('id', userId)
                .single()
                .then(({ data: currentUser }) => {
                    if (currentUser) {
                        const newProjectsCount = Math.max(0, (currentUser.projects_count || 0) - 1);
                        const newStorageUsed = Math.max(0, (currentUser.storage_used || 0) - fileSize);
                        
                        return supabase
                            .from('users')
                            .update({
                                projects_count: newProjectsCount,
                                storage_used: newStorageUsed
                            })
                            .eq('id', userId);
                    }
                })
                .then(() => {
                    console.log(`Contadores decrementados para usuario ${userId}`);
                })
                .catch((error) => {
                    console.warn('Error actualizando contadores al eliminar:', error);
                });
        }
        
        res.json({
            success: true,
            message: 'Nube eliminada exitosamente'
        });
    } catch (error) {
        console.error('Error deleting cloud:', error);
        res.status(500).json({ error: 'Error al eliminar nube' });
    }
});
// ============================================================================
// ENDPOINTS DE DEMO
// ============================================================================

app.get('/demo-info', (req, res) => {
    try {
        const demoConfigPath = path.join(__dirname, '../data/demo-config.json');

        if (!fs.existsSync(demoConfigPath)) {
            return res.json({ hasDemo: false });
        }

        const demoConfig = JSON.parse(fs.readFileSync(demoConfigPath, 'utf8'));
        res.json({
            hasDemo: true,
            fileId: demoConfig.fileId,
            originalName: demoConfig.originalName,
            setAt: demoConfig.setAt
        });

    } catch (error) {
        console.error('Error getting demo info:', error);
        res.json({ hasDemo: false });
    }
});

app.post('/set-demo', (req, res) => {
    try {
        const { fileId, originalName } = req.body;

        if (!fileId || !originalName) {
            return res.status(400).json({ error: 'fileId y originalName requeridos' });
        }

        const cloudDir = path.join(__dirname, '../data/converted', fileId);
        if (!fs.existsSync(cloudDir)) {
            return res.status(404).json({ error: 'Nube no encontrada' });
        }

        const demoConfig = {
            fileId,
            originalName,
            setAt: new Date().toISOString()
        };

        const demoConfigPath = path.join(__dirname, '../data/demo-config.json');
        fs.writeFileSync(demoConfigPath, JSON.stringify(demoConfig, null, 2));

        res.json({
            success: true,
            message: 'Demo configurado',
            demoConfig
        });

    } catch (error) {
        console.error('Error setting demo:', error);
        res.status(500).json({ error: 'Error al configurar demo' });
    }
});

// ============================================================================
// FUNCIÓN AUXILIAR
// ============================================================================

function generateViewerHTML(originalName, fileId) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Viizor - ${originalName}</title>
    <link rel="stylesheet" type="text/css" href="/potree/build/potree/potree.css">
    <link rel="stylesheet" type="text/css" href="/potree/libs/jquery-ui/jquery-ui.min.css">
    <link rel="stylesheet" type="text/css" href="/potree/libs/openlayers3/ol.css">
    <link rel="stylesheet" type="text/css" href="/potree/libs/spectrum/spectrum.css">
    <link rel="stylesheet" type="text/css" href="/potree/libs/jstree/themes/mixed/style.css">
</head>
<body>
    <script src="/potree/libs/jquery/jquery-3.1.1.min.js"></script>
    <script src="/potree/libs/spectrum/spectrum.js"></script>
    <script src="/potree/libs/jquery-ui/jquery-ui.min.js"></script>
    <script src="/potree/libs/other/BinaryHeap.js"></script>
    <script src="/potree/libs/tween/tween.min.js"></script>
    <script src="/potree/libs/d3/d3.js"></script>
    <script src="/potree/libs/proj4/proj4.js"></script>
    <script src="/potree/libs/openlayers3/ol.js"></script>
    <script src="/potree/libs/i18next/i18next.js"></script>
    <script src="/potree/libs/jstree/jstree.js"></script>
    <script src="/potree/build/potree/potree.js"></script>
    <script src="/potree/libs/plasio/js/laslaz.js"></script>

    <div class="potree_container" style="position: absolute; top: 0px; left: 0px; width: 100%; height: 100%; margin: 0px; padding: 0px; overflow: hidden;">
        <div id="potree_render_area" style="background-image: url('/potree/build/potree/resources/images/background_galaxy.jpg');"></div>
        <div id="potree_sidebar_container"></div>
    </div>

    <script>
        window.viewer = new Potree.Viewer(document.getElementById("potree_render_area"));
        viewer.setEDLEnabled(false);
        viewer.setFOV(60);
        viewer.setPointBudget(5*1000*1000);
        viewer.setBackground("gradient");
        viewer.loadSettingsFromURL();
        viewer.setDescription("Visualizador Viizor - ${originalName}");

        viewer.loadGUI(() => {
            viewer.setLanguage("es");
            $("#menu_appearance").next().show();
            $("#menu_tools").next().show();
            $("#menu_scene").next().show();
            viewer.toggleSidebar();
        });

        Potree.loadPointCloud("/data/converted/${fileId}/metadata.json", "${originalName}", e => {
            let scene = viewer.scene;
            let pointcloud = e.pointcloud;
            let material = pointcloud.material;

            material.size = 1;
            material.minSize = 3;
            material.pointSizeType = Potree.PointSizeType.ATTENUATED;
            material.shape = Potree.PointShape.CIRCLE;

            scene.addPointCloud(pointcloud);
            viewer.fitToScreen();
        });
    </script>
</body>
</html>`;
}
// ============================================================================
// ADMIN: SINCRONIZACIÓN DE USUARIOS
// ============================================================================

// NUEVO ENDPOINT: Sincronizar usuarios de auth.users a tabla users
app.post('/admin/sync-users', authenticateUser, requireAdmin, async (req, res) => {
    try {
        console.log('Iniciando sincronización de usuarios...');
        
        // 1. Obtener todos los usuarios de auth.users
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (authError) {
            throw authError;
        }

        // 2. Obtener usuarios existentes en tabla users
        const { data: existingUsers, error: usersError } = await supabase
            .from('users')
            .select('id, email');
        
        if (usersError) {
            throw usersError;
        }

        // 3. Encontrar usuarios que están en auth pero no en users
        const existingEmails = existingUsers.map(u => u.email);
        const missingUsers = authUsers.users.filter(authUser => 
            !existingEmails.includes(authUser.email)
        );

        console.log(`Usuarios en auth: ${authUsers.users.length}, En tabla users: ${existingUsers.length}, Faltantes: ${missingUsers.length}`);

        // 4. Crear usuarios faltantes en la tabla users
        const createdUsers = [];
        for (const authUser of missingUsers) {
            try {
                const { data: newUser, error: createError } = await supabase
                    .from('users')
                    .insert([{
                        id: authUser.id,
                        email: authUser.email,
                        name: authUser.user_metadata?.name || authUser.email.split('@')[0],
                        plan: 'trial',
                        storage_limit: 5368709120, // 5GB
                        trial_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        country: null, // OPCIONAL - puede estar vacío
                        industry: null, // OPCIONAL - puede estar vacío
                        created_at: authUser.created_at
                    }])
                    .select()
                    .single();
                
                if (!createError) {
                    createdUsers.push(newUser);
                    console.log(`Usuario creado: ${authUser.email}`);
                } else {
                    console.warn(`Error creando ${authUser.email}:`, createError.message);
                }
            } catch (err) {
                console.warn(`Error procesando ${authUser.email}:`, err.message);
            }
        }

        res.json({
            success: true,
            message: `Sincronización completada - ${createdUsers.length} usuarios creados`,
            stats: {
                authUsersTotal: authUsers.users.length,
                existingUsers: existingUsers.length,
                createdUsers: createdUsers.length
            },
            newUsers: createdUsers.map(u => ({ id: u.id, email: u.email, name: u.name }))
        });

    } catch (error) {
        console.error('Error en sincronización:', error);
        res.status(500).json({
            error: 'Error sincronizando usuarios',
            details: error.message
        });
    }
});

// ============================================================================
// INICIO DEL SERVIDOR
// ============================================================================
// ENDPOINT: Sincronizar contadores de proyectos por usuario (desde archivos)
// ENDPOINT: Sincronizar contadores de proyectos por usuario (desde archivos)
app.post('/admin/sync-project-counts', authenticateUser, requireAdmin, async (req, res) => {
    try {
        console.log('Sincronizando contadores desde archivos...');
        
        const convertedDir = path.join(__dirname, '../data/converted');
        const userProjectCounts = {};
        const userStorageUsed = {};
        
        if (fs.existsSync(convertedDir)) {
            const folders = fs.readdirSync(convertedDir);
            for (const folder of folders) {
                const projectPath = path.join(convertedDir, folder, 'project.json');
                if (fs.existsSync(projectPath)) {
                    try {
                        const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
                        const userId = projectData.userId;
                        if (userId) {
                            userProjectCounts[userId] = (userProjectCounts[userId] || 0) + 1;
                            userStorageUsed[userId] = (userStorageUsed[userId] || 0) + (projectData.fileSize || 0);
                        }
                    } catch (e) {
                        // Ignore invalid project files
                    }
                }
            }
        }

        console.log('Conteos por usuario:', userProjectCounts);
        console.log('Storage por usuario:', userStorageUsed);

        // Actualizar contadores en tabla users
        const updates = [];
        for (const [userId, count] of Object.entries(userProjectCounts)) {
            const { error: updateError } = await supabase
                .from('users')
                .update({ 
                    projects_count: count,
                    storage_used: userStorageUsed[userId] || 0
                })
                .eq('id', userId);
                
            if (!updateError) {
                updates.push({ userId, count, storage: userStorageUsed[userId] || 0 });
            }
        }

        res.json({
            success: true,
            message: `Contadores sincronizados - ${updates.length} usuarios actualizados`,
            updates: updates
        });

    } catch (error) {
        console.error('Error sincronizando contadores:', error);
        res.status(500).json({
            error: 'Error sincronizando contadores',
            details: error.message
        });
    }
});
// ==========================================
// ENDPOINTS DE MENSAJERÍA
// ==========================================

// ADMIN: Enviar mensaje a usuarios seleccionados
app.post('/admin/send-message', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { user_ids, subject, message } = req.body;
        
        if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
            return res.status(400).json({ error: 'user_ids requerido y debe ser array' });
        }
        
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        const { data: { user: adminUser } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));
        
        const messagesToInsert = user_ids.map(userId => ({
            from_user_id: adminUser.id,
            to_user_id: userId,
            subject: subject || 'Mensaje del administrador',
            message: message.trim(),
            is_from_admin: true
        }));

        const { data: insertedMessages, error } = await supabase
            .from('messages')
            .insert(messagesToInsert)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: `Mensaje enviado a ${user_ids.length} usuario(s)`,
            sent_to: user_ids.length,
            message_ids: insertedMessages.map(m => m.id)
        });

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({ 
            error: 'Error enviando mensaje',
            details: error.message 
        });
    }
});

// ADMIN: Obtener conversación con usuario específico
app.get('/admin/messages/:userId', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                id,
                subject,
                message,
                is_from_admin,
                parent_message_id,
                created_at,
                read_at
            `)
            .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const conversations = {};
        const rootMessages = [];

        messages.forEach(msg => {
            if (msg.parent_message_id === null) {
                msg.replies = [];
                conversations[msg.id] = msg;
                rootMessages.push(msg);
            } else {
                if (conversations[msg.parent_message_id]) {
                    conversations[msg.parent_message_id].replies.push(msg);
                }
            }
        });

        res.json({
            success: true,
            conversations: rootMessages,
            total_messages: messages.length
        });

    } catch (error) {
        console.error('Error obteniendo conversación:', error);
        res.status(500).json({ 
            error: 'Error obteniendo conversación',
            details: error.message 
        });
    }
});

// ADMIN: Responder a mensaje
app.post('/admin/reply/:messageId', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { message } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        const { data: originalMessage, error: fetchError } = await supabase
            .from('messages')
            .select('to_user_id, from_user_id')
            .eq('id', messageId)
            .single();

        if (fetchError) throw fetchError;

        const { data: { user: adminUser } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));

        const { data: reply, error } = await supabase
            .from('messages')
            .insert({
                from_user_id: adminUser.id,
                to_user_id: originalMessage.from_user_id,
                message: message.trim(),
                is_from_admin: true,
                parent_message_id: parseInt(messageId)
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Respuesta enviada',
            reply_id: reply.id
        });

    } catch (error) {
        console.error('Error enviando respuesta:', error);
        res.status(500).json({ 
            error: 'Error enviando respuesta',
            details: error.message 
        });
    }
});

// USER: Obtener mensajes del usuario
app.get('/user/messages', authenticateUser, async (req, res) => {
    try {
        const { data: { user } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));

        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                id,
                subject,
                message,
                is_from_admin,
                parent_message_id,
                created_at,
                read_at
            `)
            .eq('to_user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const conversations = [];
        const replies = {};

        messages.forEach(msg => {
            if (msg.parent_message_id === null) {
                msg.replies = [];
                conversations.push(msg);
            } else {
                if (!replies[msg.parent_message_id]) {
                    replies[msg.parent_message_id] = [];
                }
                replies[msg.parent_message_id].push(msg);
            }
        });

        conversations.forEach(conv => {
            if (replies[conv.id]) {
                conv.replies = replies[conv.id];
            }
        });

        res.json({
            success: true,
            conversations,
            unread_count: messages.filter(m => m.read_at === null).length
        });

    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ 
            error: 'Error obteniendo mensajes',
            details: error.message 
        });
    }
});

// USER: Responder a mensaje
app.post('/user/reply/:messageId', authenticateUser, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { message } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        const { data: { user } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));

        const { data: originalMessage, error: fetchError } = await supabase
            .from('messages')
            .select('to_user_id, from_user_id')
            .eq('id', messageId)
            .eq('to_user_id', user.id)
            .single();

        if (fetchError) throw fetchError;

        const { data: reply, error } = await supabase
            .from('messages')
            .insert({
                from_user_id: user.id,
                to_user_id: originalMessage.from_user_id,
                message: message.trim(),
                is_from_admin: false,
                parent_message_id: parseInt(messageId)
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Respuesta enviada',
            reply_id: reply.id
        });

    } catch (error) {
        console.error('Error enviando respuesta:', error);
        res.status(500).json({ 
            error: 'Error enviando respuesta',
            details: error.message 
        });
    }
});

// USER: Marcar mensaje como leído
app.put('/user/messages/:messageId/read', authenticateUser, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const { data: { user } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));

        const { error } = await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', messageId)
            .eq('to_user_id', user.id)
            .is('read_at', null);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Mensaje marcado como leído'
        });

    } catch (error) {
        console.error('Error marcando mensaje como leído:', error);
        res.status(500).json({ 
            error: 'Error marcando mensaje como leído',
            details: error.message 
        });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 Viizor Backend running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 Supabase test: http://localhost:${PORT}/test-supabase`);
    console.log(`✨ Smart auth ready - Check user + Login/Register separated`);
});

module.exports = app;
