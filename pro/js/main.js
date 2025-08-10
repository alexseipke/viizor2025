// ===================================
// VIIZOR PRO - MAIN APPLICATION
// Sistema unificado de autenticación + Visor 3D
// Compatible con server.js + index.html
// ===================================

class ViizorApp {
    constructor() {
        // Core variables
        this.viewer = null;
        this.currentCloudId = null;
        this.currentTool = null;
        this.isViewerLoaded = false;
        this.measurementCount = 0;
        this.isEditingName = false;
        this.currentProfile = null;
        this.profilePanelVisible = false;

        // ÚNICO ESTADO DE AUTENTICACIÓN
        this.authToken = null;
        this.user = null;
        this.isAuthenticated = false;

        this.init();
    }

    // ===================================
    // SISTEMA DE AUTENTICACIÓN UNIFICADO
    // ===================================

    async init() {
        console.log('🚀 Inicializando Viizor App...');

        // 1. Capturar token de magic link si existe
        await this.captureAuthToken();

        // 2. Verificar sesión existente
        await this.checkExistingSession();

        // 3. Actualizar UI según estado de auth
        this.updateAuthUI();

        // 4. Inicializar componentes
        this.initializeUI();

        // 5. Cargar demo o preparar upload
        await this.loadDemoIfExists();
    }

    async captureAuthToken() {
        const hash = window.location.hash;

        if (hash && hash.includes('access_token=')) {
            console.log('🎯 Magic link detectado, capturando token...');

            try {
                // Extraer parámetros del hash
                const params = new URLSearchParams(hash.substring(1));
                const token = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (token) {
                    this.authToken = token;
                    localStorage.setItem('viizor_auth_token', token);

                    if (refreshToken) {
                        localStorage.setItem('viizor_refresh_token', refreshToken);
                    }

                    // Limpiar URL sin recargar página
                    window.history.replaceState({}, document.title, window.location.pathname);

                    // Verificar y obtener perfil de usuario
                    await this.verifyUserProfile();

                    this.updateStatus('✅ ¡Bienvenido! Sesión iniciada correctamente');
                    return true;
                }
            } catch (error) {
                console.error('❌ Error capturando magic link:', error);
                this.updateStatus('Error de autenticación');
            }
        }

        // Verificar token en localStorage
        const storedToken = localStorage.getItem('viizor_auth_token');
        if (storedToken) {
            this.authToken = storedToken;
            return true;
        }

        return false;
    }

    async checkExistingSession() {
        if (!this.authToken) {
            this.isAuthenticated = false;
            return false;
        }

        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user || data;
                this.isAuthenticated = true;

                console.log('✅ Sesión verificada:', this.user.email);
                return true;
            } else {
                // Token inválido, limpiar
                this.clearAuth();
                return false;
            }
        } catch (error) {
            console.error('❌ Error verificando sesión:', error);
            this.clearAuth();
            return false;
        }
    }

    async verifyUserProfile() {
        if (!this.authToken) return false;

        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user || data;
                this.isAuthenticated = true;

                console.log('✅ Perfil verificado:', this.user.email);
                this.updateAuthUI();
                return true;
            } else {
                console.error('❌ Error verificando perfil, token inválido');
                this.clearAuth();
                return false;
            }
        } catch (error) {
            console.error('❌ Error verificando perfil:', error);
            this.clearAuth();
            return false;
        }
    }

    clearAuth() {
        this.authToken = null;
        this.user = null;
        this.isAuthenticated = false;
        localStorage.removeItem('viizor_auth_token');
        localStorage.removeItem('viizor_refresh_token');
        this.updateAuthUI();
    }

    // ===================================
    // GESTIÓN DE UI DE AUTENTICACIÓN
    // ===================================

    updateAuthUI() {
        const userButton = document.getElementById('mainUserButton');

        if (!userButton) return;

        if (this.isAuthenticated && this.user) {
            // Usuario autenticado - mostrar nombre y dropdown
            const userName = this.user.name || this.user.email?.split('@')[0] || 'Usuario';
            const userInitial = userName.charAt(0).toUpperCase();

            userButton.innerHTML = `
                <div class="user-avatar">${userInitial}</div>
                <span>Hola ${userName}</span>
                <i data-lucide="chevron-down"></i>
            `;

            userButton.onclick = () => this.toggleUserDropdown();

            // Recrear íconos de Lucide
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        } else {
            // Usuario no autenticado - botón minimalista que abre modal unificado
            userButton.innerHTML = `<i data-lucide="user"></i>`;
            userButton.className = 'user-icon-btn';

            userButton.onclick = () => this.openAuthModal();

            // Recrear íconos de Lucide
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    toggleUserDropdown() {
        let dropdown = document.getElementById('userDropdown');

        if (!dropdown) {
            dropdown = this.createUserDropdown();
        }

        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    }

    createUserDropdown() {
        const userButton = document.getElementById('mainUserButton');
        if (!userButton) return null;

        // Remover dropdown existente
        const existingDropdown = document.getElementById('userDropdown');
        if (existingDropdown) {
            existingDropdown.remove();
        }

        const dropdown = document.createElement('div');
        dropdown.id = 'userDropdown';
        dropdown.className = 'dropdown-menu show';

        dropdown.innerHTML = `
            <a href="/dashboard/" class="dropdown-item">
                <i data-lucide="layout-dashboard" style="width: 16px; height: 16px; margin-right: 8px;"></i>
                Dashboard
            </a>
            <button class="dropdown-item" onclick="viizorApp.logout()">
                <i data-lucide="log-out" style="width: 16px; height: 16px; margin-right: 8px;"></i>
                Cerrar Sesión
            </button>
        `;

        userButton.parentElement.style.position = 'relative';
        userButton.parentElement.appendChild(dropdown);

        // Recrear íconos de Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Cerrar dropdown al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!userButton.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        return dropdown;
    }

    // ===================================
    // FUNCIONES DE MODAL UNIFICADO
    // ===================================

    openAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.style.display = 'block';
            this.clearAuthMessages();

            // Por defecto abrir en tab de login
            this.switchTab('login');
        }
    }

    closeAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.style.display = 'none';
            this.clearAuthMessages();
        }
    }

    switchTab(tabName) {
        // Actualizar botones de tabs
        const loginTabBtn = document.getElementById('loginTabBtn');
        const signupTabBtn = document.getElementById('signupTabBtn');

        if (loginTabBtn && signupTabBtn) {
            loginTabBtn.classList.remove('active');
            signupTabBtn.classList.remove('active');

            if (tabName === 'login') {
                loginTabBtn.classList.add('active');
            } else {
                signupTabBtn.classList.add('active');
            }
        }

        // Actualizar contenido de tabs
        const loginTab = document.getElementById('loginTab');
        const signupTab = document.getElementById('signupTab');

        if (loginTab && signupTab) {
            loginTab.classList.remove('active');
            signupTab.classList.remove('active');

            if (tabName === 'login') {
                loginTab.classList.add('active');
            } else {
                signupTab.classList.add('active');
            }
        }

        // Limpiar mensajes al cambiar tab
        this.clearAuthMessages();
    }

    clearAuthMessages() {
        const loginMessage = document.getElementById('loginMessage');
        const signupMessage = document.getElementById('signupMessage');

        if (loginMessage) loginMessage.innerHTML = '';
        if (signupMessage) signupMessage.innerHTML = '';
    }

    // ===================================
    // LÓGICA INTELIGENTE DE AUTENTICACIÓN
    // ===================================

    async handleLogin(event) {
        event.preventDefault();

        const submitBtn = document.getElementById('loginSubmitBtn');
        const messageDiv = document.getElementById('loginMessage');
        const emailInput = document.getElementById('loginEmail');

        if (!submitBtn || !messageDiv || !emailInput) return;

        const email = emailInput.value.trim();
        if (!email) {
            messageDiv.innerHTML = '<div class="error-message">❌ Email requerido</div>';
            return;
        }

        // Update UI
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span>Verificando usuario...';
        messageDiv.innerHTML = '';

        try {
            // PASO 1: Verificar si usuario existe
            console.log('🔍 Verificando si usuario existe:', email);

            const checkResponse = await fetch('/api/auth/check-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const checkData = await checkResponse.json();

            if (!checkResponse.ok) {
                throw new Error(checkData.error || 'Error verificando usuario');
            }

            if (!checkData.exists) {
                // Usuario no existe - mostrar mensaje y cambiar a registro
                console.log('❌ Usuario no existe, cambiando a registro');

                messageDiv.innerHTML = `
                    <div class="info-message">
                        Usuario no registrado. <span class="switch-tab-link" onclick="viizorApp.switchTab('signup')">Regístrese aquí</span>
                    </div>
                `;

                // Auto-cambiar a tab de registro después de 2 segundos
                setTimeout(() => {
                    this.switchTab('signup');

                    // Pre-llenar email en formulario de registro
                    const signupEmail = document.getElementById('signupEmail');
                    if (signupEmail) {
                        signupEmail.value = email;
                    }
                }, 2000);

                return;
            }

            // PASO 2: Usuario existe - enviar magic link
            console.log('✅ Usuario existe, enviando magic link');

            submitBtn.innerHTML = '<span class="loading-spinner"></span>Enviando enlace...';

            const loginResponse = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const loginData = await loginResponse.json();

            if (loginResponse.ok) {
                messageDiv.innerHTML = `
                    <div class="success-message">
                        ✅ ¡Enlace enviado! Revisa tu email y haz clic en el enlace para acceder.
                    </div>
                `;
                document.getElementById('loginForm').style.display = 'none';
            } else {
                messageDiv.innerHTML = `
                    <div class="error-message">
                        ❌ ${loginData.error || 'Error enviando enlace. Inténtalo de nuevo.'}
                    </div>
                `;
            }

        } catch (error) {
            console.error('❌ Error en login:', error);
            messageDiv.innerHTML = `
                <div class="error-message">
                    ❌ ${error.message || 'Error de conexión. Verifica tu internet e inténtalo de nuevo.'}
                </div>
            `;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Enviar Enlace de Acceso';
        }
    }

    async handleRegister(event) {
        event.preventDefault();

        const submitBtn = document.getElementById('signupSubmitBtn');
        const messageDiv = document.getElementById('signupMessage');

        if (!submitBtn || !messageDiv) return;

        const formData = {
            name: document.getElementById('signupName')?.value?.trim(),
            email: document.getElementById('signupEmail')?.value?.trim(),
            country: document.getElementById('signupCountry')?.value,
            industry: document.getElementById('signupIndustry')?.value
        };

        // Validaciones básicas
        if (!formData.name || !formData.email || !formData.country || !formData.industry) {
            messageDiv.innerHTML = '<div class="error-message">❌ Todos los campos son requeridos</div>';
            return;
        }

        // Update UI
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span>Creando cuenta...';
        messageDiv.innerHTML = '';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                messageDiv.innerHTML = `
                    <div class="success-message">
                        🎉 ¡Cuenta creada! Revisa tu email y haz clic en el enlace para activar tu cuenta.
                    </div>
                `;
                document.getElementById('signupForm').style.display = 'none';
            } else {
                // Manejar error específico de usuario ya registrado
                if (data.userExists) {
                    messageDiv.innerHTML = `
                        <div class="info-message">
                            Este email ya está registrado. <span class="switch-tab-link" onclick="viizorApp.switchTab('login')">Inicia sesión aquí</span>
                        </div>
                    `;
                } else {
                    messageDiv.innerHTML = `
                        <div class="error-message">
                            ❌ ${data.error || 'Error creando cuenta. Inténtalo de nuevo.'}
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('❌ Error en registro:', error);
            messageDiv.innerHTML = `
                <div class="error-message">
                    ❌ Error de conexión. Verifica tu internet e inténtalo de nuevo.
                </div>
            `;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Crear Cuenta y Enviar Enlace';
        }
    }

    logout() {
        this.clearAuth();
        this.updateStatus('👋 Sesión cerrada correctamente');

        // Cerrar dropdown si está abierto
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.remove();
        }

        // Opcional: recargar página para limpiar estado
        // window.location.reload();
    }

    // ===================================
    // SISTEMA DE UPLOAD
    // ===================================

    uploadCloud() {
        if (!this.isAuthenticated) {
            this.openAuthModal();
            return;
        }

        const fileInput = document.getElementById('fileUpload');
        if (fileInput) {
            fileInput.click();
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.processFile(file);
    }

    async processFile(file) {
        // Validar archivo
        if (!file.name.toLowerCase().endsWith('.las') && !file.name.toLowerCase().endsWith('.laz')) {
            alert('Error: Solo se permiten archivos .las y .laz');
            return;
        }

        // Verificar autenticación
        if (!this.isAuthenticated) {
            this.updateStatus('⚠️ Debes iniciar sesión para subir archivos');
            this.openAuthModal();
            return;
        }

        const formData = new FormData();
        formData.append('pointcloud', file);

        this.updateStatus('Subiendo y convirtiendo...');

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.updateStatus('Cargando nube...');
                this.loadConvertedCloud(data.fileId, data.originalName);
            } else {
                this.updateStatus('Error: ' + data.error);

                // Manejar errores específicos de autenticación
                if (response.status === 401) {
                    this.clearAuth();
                    alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
                } else if (response.status === 402) {
                    alert('Has alcanzado el límite de tu plan. Actualiza para continuar.');
                }
            }
        } catch (error) {
            this.updateStatus('Error subiendo archivo');
            console.error('Upload error:', error);
        }
    }

    // ===================================
    // SISTEMA DE VISOR 3D
    // ===================================

    updateStatus(message) {
        const statusElement = document.getElementById('viewerStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log('📊', message);
    }

    loadConvertedCloud(fileId, originalName) {
        this.currentCloudId = fileId;

        // Hide upload area, show viewer
        const uploadArea = document.getElementById('uploadArea');
        const renderArea = document.getElementById('potree_render_area');

        if (uploadArea) uploadArea.classList.add('hidden');
        if (renderArea) renderArea.classList.remove('hidden');

        try {
            // Initialize Potree viewer
            this.viewer = new Potree.Viewer(document.getElementById("potree_render_area"));
            this.viewer.setEDLEnabled(false);
            this.viewer.setFOV(60);
            this.viewer.setPointBudget(5_000_000);
            this.viewer.setBackground("black");

            this.viewer.loadGUI(() => {
                this.viewer.setLanguage('en');

                // Hide Potree sidebar
                setTimeout(() => {
                    $('#potree_sidebar_container').hide();
                    $('.potree_sidebar_container').hide();
                    $('.potree-sidebar').hide();
                    $('div[id*="sidebar"]').hide();
                    $('div[class*="sidebar"]').hide();
                    $('.potree_menu_toggle').hide();
                    $('#potree_menu_toggle').hide();
                    $('div[class*="menu_toggle"]').hide();
                    $('.hamburger-menu').hide();
                    $('.menu-toggle').hide();
                    $('.panel').hide();
                    $('.panel-body').hide();
                    $('.panel-header').hide();
                }, 100);

                this.viewer.setControls(this.viewer.earthControls);
            });

            // Load point cloud
            const cloudPath = `/viewer/${fileId}/metadata.json`;

            Potree.loadPointCloud(cloudPath, originalName, e => {
                let scene = this.viewer.scene;
                let pointcloud = e.pointcloud;
                let material = pointcloud.material;

                material.size = 1;
                material.minSize = 3;
                material.pointSizeType = Potree.PointSizeType.ATTENUATED;
                material.shape = Potree.PointShape.CIRCLE;

                scene.addPointCloud(pointcloud);
                this.viewer.fitToScreen();

                this.isViewerLoaded = true;

                // Auto-abrir ventana 2D cuando se complete un perfil
                this.viewer.scene.addEventListener("profile_added", (event) => {
                    let profile = event.profile;
                    if (profile && profile.points.length >= 2) {
                        setTimeout(() => {
                            this.currentProfile = profile;
                            this.initializeProfileWindow();
                        }, 300);
                    }
                });
                this.setupEventListeners();

                this.updateStatus(`✅ ${originalName} cargada • Herramientas listas`);
            });

        } catch (error) {
            this.updateStatus('Error inicializando visor');
            console.error(error);
        }
    }

    async loadDemoIfExists() {
        try {
            // Chequear UUID en URL primero
            const urlParams = new URLSearchParams(window.location.search);
            const uuid = urlParams.get('uuid');
            if (uuid) {
                console.log('🎯 UUID detectado:', uuid);
                this.updateStatus('Cargando proyecto...');
                this.loadConvertedCloud(uuid, 'Proyecto');
                return;
            }
            this.updateStatus('Verificando demo...');
            const response = await fetch('/api/demo-info');
            const demoInfo = await response.json();

            if (demoInfo.hasDemo) {
                this.updateStatus('Cargando demo...');
                this.loadConvertedCloud(demoInfo.fileId, demoInfo.originalName);
            } else {
                this.updateStatus('Listo para cargar nube');
                const uploadArea = document.getElementById('uploadArea');
                if (uploadArea) {
                    uploadArea.innerHTML = `
                        <h2>Viizor - Cloud</h2>
                        <p>Arrastra un archivo .las/.laz aquí o haz clic para seleccionar</p>
                        <button class="demo-button" onclick="viizorApp.uploadCloud()">📤 Subir Nube</button>
                    `;
                }
            }
        } catch (error) {
            this.updateStatus('Listo para cargar nube');
            console.error('No demo available:', error);
        }
    }

    // ===================================
    // SISTEMA DE HERRAMIENTAS
    // ===================================

    setupEventListeners() {
        if (!this.viewer || !this.viewer.scene) return;


        // Cleanup on page unload
        window.addEventListener("beforeunload", () => {
            if (this.currentCloudId) {
                fetch(`/api/cleanup/${this.currentCloudId}`, {method: "DELETE"});
            }
        });
    }

    toggleCard(cardHeader) {
        const card = cardHeader.parentElement;
        const content = card.querySelector('.card-content');
        const icon = cardHeader.querySelector('.expand-icon');

        if (content) content.classList.toggle('expanded');
        if (icon) icon.classList.toggle('expanded');
    }

    activateTool(toolName) {
        if (!this.viewer || !this.isViewerLoaded) {
            this.updateStatus('⚠️ Espera a que se cargue la nube');
            return;
        }

        // Deactivate current tool
        document.querySelectorAll('.tool-item').forEach(item => {
            item.classList.remove('active');
        });

        // Activate new tool
        const toolElement = document.querySelector(`[data-tool="${toolName}"]`);
        if (toolElement) {
            toolElement.classList.add('active');
        }

        this.currentTool = toolName;
        this.activatePotreeTool(toolName);
    }

    activatePotreeTool(toolName) {
        if (!this.viewer || !this.isViewerLoaded) return;

        try {
            let measurement;

            switch(toolName) {
                case 'distance':
                    if (this.viewer.measuringTool) {
                        measurement = this.viewer.measuringTool.startInsertion({
                            showDistances: true,
                            showArea: false,
                            closed: false,
                            name: `Distancia ${++this.measurementCount}`
                        });
                        this.updateStatus('📏 Herramienta Distancia activada - Haz clic en dos puntos');
                    }
                    break;

                case 'area':
                    if (this.viewer.measuringTool) {
                        measurement = this.viewer.measuringTool.startInsertion({
                            showDistances: false,
                            showArea: true,
                            closed: true,
                            name: `Área ${++this.measurementCount}`
                        });
                        this.updateStatus('📐 Herramienta Área activada - Haz clic para crear polígono');
                    }
                    break;

                case 'height':
                    if (this.viewer.measuringTool) {
                        measurement = this.viewer.measuringTool.startInsertion({
                            showDistances: false,
                            showHeight: true,
                            closed: false,
                            name: `Altura ${++this.measurementCount}`
                        });
                        this.updateStatus('📊 Herramienta Altura activada - Haz clic en dos puntos');
                    }
                    break;

                case 'angle':
                    if (this.viewer.measuringTool) {
                        measurement = this.viewer.measuringTool.startInsertion({
                            showDistances: false,
                            showAngles: true,
                            closed: false,
                            name: `Ángulo ${++this.measurementCount}`
                        });
                        this.updateStatus('📐 Herramienta Ángulo activada - Haz clic en tres puntos');
                    }
                    break;

                case 'point':
                    if (this.viewer.measuringTool) {
                        measurement = this.viewer.measuringTool.startInsertion({
                            showDistances: false,
                            showAngles: false,
                            showCoordinates: true,
                            showArea: false,
                            closed: true,
                            maxMarkers: 1,
                            name: `Punto ${++this.measurementCount}`
                        });
                        this.updateStatus('📍 Herramienta Punto activada - Haz clic para marcar');
                    }
                    break;

                case 'profile':
                    if (this.viewer.profileTool) {
                        let profile = this.viewer.profileTool.startInsertion();
                        this.updateStatus("📈 Herramienta Perfil activada - Haz clic para crear puntos, clic derecho para finalizar");

                        let domElement = this.viewer.renderer.domElement;
                        let rightClickInterceptor = (e) => {
                            if (e.button === 2) {
                                e.preventDefault();
                                if (profile.points.length >= 2) {
                                    setTimeout(() => {
                                        let profileInScene = this.viewer.scene.profiles.find(p => p === profile);
                                        if (profileInScene) {
                                            this.currentProfile = profile;
                                            this.initializeProfileWindow();
                                        }
                                    }, 200);
                                }
                                domElement.removeEventListener("mouseup", rightClickInterceptor);
                            }
                        };
                        domElement.addEventListener("mouseup", rightClickInterceptor);
                    }
                    break;

                case 'annotation':
                    this.createAnnotation();
                    break;

                case 'volume':
                    if (this.viewer.volumeTool) {
                        this.viewer.volumeTool.startInsertion();
                        this.updateStatus('📦 Herramienta Volumen activada - Dibuja una caja');
                    }
                    break;

                default:
                    this.updateStatus(`🔧 ${toolName} activada`);
            }

            if (measurement) {
                setTimeout(() => {
                    this.updateMeasurementsList();
                    this.updateAnnotationsList();
                }, 500);
            }

        } catch (error) {
            console.error('Tool activation error:', error);
            this.updateStatus(`🔧 ${toolName} activada (modo básico)`);
        }
    }

    createAnnotation() {
        this.updateStatus('📍 Haz clic en la nube de puntos para colocar anotación');

        if (this.viewer && this.viewer.scene && this.viewer.scene.pointclouds.length > 0) {
            const pointcloud = this.viewer.scene.pointclouds[0];
            const bbox = pointcloud.boundingBox;
            const center = {
                x: (bbox.min.x + bbox.max.x) / 2,
                y: (bbox.min.y + bbox.max.y) / 2,
                z: (bbox.min.z + bbox.max.z) / 2
            };

            const newAnnotation = new Potree.Annotation({
                position: [center.x, center.y, center.z + 10],
                title: `Anotación ${Date.now()}`,
                description: "Haz clic para editar"
            });

            this.viewer.scene.annotations.add(newAnnotation);
            this.updateAnnotationsList();
            this.updateStatus('📍 Anotación creada en centro de nube');
        }
    }

    // ===================================
    // GESTIÓN DE MEDICIONES
    // ===================================

    updateMeasurementsList() {
        if (this.isEditingName || !this.viewer || !this.viewer.scene) return;

        const measurementsList = document.getElementById('measurementsList');
        if (!measurementsList) return;

        const measurements = this.viewer.scene.measurements;

        if (measurements.length === 0) {
            measurementsList.innerHTML = `
                <p style="color: #9ca3af; font-size: 15px; text-align: center; padding: 20px;">
                    No hay mediciones.<br>
                    Usa las herramientas para empezar.
                </p>
            `;
            return;
        }

        measurementsList.innerHTML = measurements.map((measurement, index) => {
            let value = '';
            if (measurement.getArea && measurement.getArea() > 0) {
                const area = measurement.getArea().toFixed(2);
                const perimeter = measurement.getTotalDistance ? measurement.getTotalDistance().toFixed(2) : "N/A";
                value = `Área: ${area} m² | Perímetro: ${perimeter} m`;
            } else if (measurement.getTotalDistance && measurement.getTotalDistance() > 0) {
                value = `Distancia: ${measurement.getTotalDistance().toFixed(2)} m`;
            }

            return `
                <div class="measurement-item">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span onclick="viizorApp.editMeasurementName(this, ${index})" style="cursor: pointer; padding: 2px 4px; border-radius: 3px;" onmouseover="this.style.background='rgba(59, 130, 246, 0.1)'" onmouseout="this.style.background='transparent'">${measurement.name || `Medición ${index + 1}`}</span>
                        <div style="display: flex; gap: 4px;">
                            <button onclick="viizorApp.exportMeasurement(${index})" style="background: rgba(55,65,81,0.6); border: 1px solid rgba(75,85,99,0.4); color: #9ca3af; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
                                <i data-lucide="download" style="width: 10px; height: 10px;"></i>
                            </button>
                            <button onclick="viizorApp.toggleMeasurementVisibility(${index}, this)" style="background: rgba(55,65,81,0.6); border: 1px solid rgba(75,85,99,0.4); color: #9ca3af; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
                                <i data-lucide="eye" style="width: 10px; height: 10px;"></i>
                            </button>
                            <button onclick="viizorApp.removeMeasurement(${index})" style="background: rgba(55,65,81,0.6); border: 1px solid rgba(75,85,99,0.4); color: #9ca3af; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
                                <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                            </button>
                        </div>
                    </div>
                    ${value ? `<div class="measurement-value">${value}</div>` : ''}
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    updateAnnotationsList() {
        if (this.isEditingName || !this.viewer || !this.viewer.scene || !this.viewer.scene.annotations) return;

        const annotationsList = document.getElementById("annotationsList");
        if (!annotationsList) return;

        const annotations = this.viewer.scene.annotations.children;

        if (annotations.length === 0) {
            annotationsList.innerHTML = `
                <p style="color: #9ca3af; font-size: 15px; text-align: center; padding: 20px;">
                    No hay anotaciones.<br>
                    Usa las herramientas para empezar.
                </p>
            `;
            return;
        }

        annotationsList.innerHTML = annotations.map((annotation, index) => {
            const title = annotation._title || `Anotación ${index + 1}`;
            const description = annotation._description ? `<div style="color: #9ca3af; font-size: 11px; margin-top: 4px; line-height: 1.3; max-width: 180px; word-wrap: break-word;">${annotation._description}</div>` : "";
            return `
                <div class="annotation-item">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 12px;">
                        <div style="flex: 1; margin-right: 12px; min-width: 0;">
                            <span onclick="viizorApp.editAnnotationName(this, ${index})" style="cursor: pointer; padding: 2px 4px; border-radius: 3px;" onmouseover="this.style.background='rgba(59, 130, 246, 0.1)'" onmouseout="this.style.background='transparent'">${title}</span>
                            ${description}
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button onclick="viizorApp.exportAnnotation(${index})" style="background: rgba(55,65,81,0.6); border: 1px solid rgba(75,85,99,0.4); color: #9ca3af; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
                                <i data-lucide="download" style="width: 10px; height: 10px;"></i>
                            </button>
                            <button onclick="viizorApp.toggleAnnotationVisibility(${index}, this)" style="background: rgba(55,65,81,0.6); border: 1px solid rgba(75,85,99,0.4); color: #9ca3af; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
                                <i data-lucide="eye" style="width: 10px; height: 10px;"></i>
                            </button>
                            <button onclick="viizorApp.removeAnnotation(${index})" style="background: rgba(55,65,81,0.6); border: 1px solid rgba(75,85,99,0.4); color: #9ca3af; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
                                <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ===================================
    // ACCIONES DE MEDICIONES
    // ===================================

    editMeasurementName(element, index) {
        const currentName = element.textContent;
        const input = document.createElement("input");
        input.type = "text";
        input.value = currentName;
        input.style.cssText = "background: #1e293b; color: white; border: 1px solid #3b82f6; border-radius: 3px; padding: 2px 4px; font-size: 14px; width: 120px;";

        input.onblur = input.onkeydown = (e) => {
            if (e.type === "blur" || e.key === "Enter") {
                const newName = input.value.trim() || currentName;
                this.viewer.scene.measurements[index].name = newName;
                element.textContent = newName;
                element.style.display = "inline";
                input.remove();
                this.isEditingName = false;
            } else if (e.key === "Escape") {
                element.style.display = "inline";
                input.remove();
                this.isEditingName = false;
            }
        };

        element.style.display = "none";
        element.parentNode.insertBefore(input, element);
        this.isEditingName = true;
        input.focus();
        input.select();
    }

    removeMeasurement(index) {
        if (this.viewer && this.viewer.scene && this.viewer.scene.measurements[index]) {
            this.viewer.scene.removeMeasurement(this.viewer.scene.measurements[index]);
            this.updateMeasurementsList();
            this.updateAnnotationsList();
        }
    }

    exportMeasurement(index) {
        const measurement = this.viewer.scene.measurements[index];
        if (measurement) {
            const data = {
                name: measurement.name,
                type: measurement.showArea ? 'area' : measurement.showHeight ? 'height' : 'distance',
                distance: measurement.getTotalDistance ? measurement.getTotalDistance() : null,
                area: measurement.getArea ? measurement.getArea() : null,
                points: measurement.points ? measurement.points.map(p => ({x: p.x, y: p.y, z: p.z})) : []
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${measurement.name || 'medicion'}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    toggleMeasurementVisibility(index, btn) {
        const measurement = this.viewer.scene.measurements[index];
        if (measurement) {
            measurement.visible = !measurement.visible;
            const icon = btn.querySelector("i");
            icon.setAttribute("data-lucide", measurement.visible ? "eye" : "eye-off");
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    // ===================================
    // ACCIONES DE ANOTACIONES
    // ===================================

    editAnnotationName(element, index) {
        const currentName = element.textContent;
        const input = document.createElement("input");
        input.type = "text";
        input.value = currentName;
        input.style.cssText = "background: #1e293b; color: white; border: 1px solid #3b82f6; border-radius: 3px; padding: 2px 4px; font-size: 14px; width: 120px;";

        input.onblur = input.onkeydown = (e) => {
            if (e.type === "blur" || e.key === "Enter") {
                const newName = input.value.trim() || currentName;
                this.viewer.scene.annotations.children[index]._title = newName;
                element.textContent = newName;
                element.style.display = "inline";
                input.remove();
                this.isEditingName = false;
            } else if (e.key === "Escape") {
                element.style.display = "inline";
                input.remove();
                this.isEditingName = false;
            }
        };

        element.style.display = "none";
        element.parentNode.insertBefore(input, element);
        this.isEditingName = true;
        input.focus();
        input.select();
    }

    toggleAnnotationVisibility(index, btn) {
        const annotation = this.viewer.scene.annotations.children[index];
        if (annotation) {
            annotation.visible = !annotation.visible;
            const icon = btn.querySelector("i");
            icon.setAttribute("data-lucide", annotation.visible ? "eye" : "eye-off");
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    removeAnnotation(index) {
        if (this.viewer && this.viewer.scene && this.viewer.scene.annotations.children[index]) {
            this.viewer.scene.annotations.remove(this.viewer.scene.annotations.children[index]);
            this.updateAnnotationsList();
        }
    }

    exportAnnotation(index) {
        const annotation = this.viewer.scene.annotations.children[index];
        if (annotation) {
            const data = {
                title: annotation._title,
                description: annotation._description,
                position: annotation.position
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${annotation._title || 'anotacion'}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    // ===================================
    // SISTEMA DE PERFILES
    // ===================================

    initializeProfileWindow() {
        if (!this.viewer.profileWindow) {
            this.viewer.profileWindow = new Potree.ProfileWindow(this.viewer);
            this.viewer.profileWindowController = new Potree.ProfileWindowController(this.viewer);
        }

        this.viewer.profileWindow.show();

        setTimeout(() => {
            let profileWindow = document.getElementById("profile_window");
            if (profileWindow) {
                profileWindow.style.position = "fixed";
                profileWindow.style.bottom = "0";
                profileWindow.style.left = "350px";
                profileWindow.style.right = "0";
                profileWindow.style.top = "auto";
                profileWindow.style.width = "auto";
                profileWindow.style.height = "300px";
                profileWindow.style.margin = "0";
                profileWindow.style.border = "none";
                profileWindow.style.borderTop = "2px solid #3B82F6";
                profileWindow.style.boxShadow = "0 -4px 20px rgba(0,0,0,0.15)";
                profileWindow.style.zIndex = "500";
                profileWindow.style.transform = "none";

                let titlebar = document.getElementById("profile_titlebar");
                if (titlebar) {
                    titlebar.style.background = "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)";
                    titlebar.style.color = "white";
                    titlebar.style.height = "40px";
                    titlebar.style.cursor = "ns-resize";
                }

                let selectionProps = document.getElementById("profileSelectionProperties");
                if (selectionProps) {
                    selectionProps.style.display = "none !important";
                    selectionProps.style.visibility = "hidden";
                }
            }
        }, 100);

        if (this.currentProfile) {
            this.viewer.profileWindowController.setProfile(this.currentProfile);
        }
    }

    updateProfileWidth(value) {
        if (this.currentProfile) {
            this.currentProfile.setWidth(parseFloat(value));
            const widthElement = document.getElementById("profileWidthValue");
            const widthElementRight = document.getElementById("profileWidthValueRight");

            if (widthElement) {
                widthElement.textContent = `${parseFloat(value).toFixed(1)} m`;
            }
            if (widthElementRight) {
                widthElementRight.textContent = `${parseFloat(value).toFixed(2)} m`;
            }
        }
    }

    // ===================================
    // FUNCIONES DE COLABORACIÓN
    // ===================================

    shareView() {
        if (!this.isAuthenticated) {
            this.openAuthModal();
            return;
        }
        alert("🔗 Generando enlace para compartir...");
    }

    addComment() {
        if (!this.isAuthenticated) {
            this.openAuthModal();
            return;
        }
        alert("💬 Añadiendo comentario...");
    }

    startMeeting() {
        if (!this.isAuthenticated) {
            this.openAuthModal();
            return;
        }
        alert("📹 Iniciando reunión...");
    }

    exportTeam() {
        if (!this.isAuthenticated) {
            this.openAuthModal();
            return;
        }
        alert("📤 Enviando al equipo...");
    }

    exportAll() {
        alert("📦 Exportando paquete completo con todos los elementos");
    }

    // ===================================
    // FUNCIONES DE EXPORTACIÓN
    // ===================================

    toggleExportCategory(category) {
        const content = document.getElementById(category + "Content");
        const arrow = document.getElementById(category + "Arrow");

        if (content && arrow) {
            if (content.style.display === "none" || !content.style.display) {
                content.style.display = "block";
                arrow.textContent = "▼";
            } else {
                content.style.display = "none";
                arrow.textContent = "▶";
            }
        }
    }

    updateAllExportCategories() {
        if (!this.viewer || !this.viewer.scene) return;

        // Update measurements
        const measurements = this.viewer.scene.measurements || [];
        this.updateCategoryCount("measurements", measurements.length);

        // Update profiles
        const profiles = this.viewer.scene.profiles || [];
        this.updateCategoryCount("profiles", profiles.length);

        // Update other categories
        this.updateCategoryCount("annotations", this.viewer.scene.annotations?.children?.length || 0);
        this.updateCategoryCount("volumes", this.viewer.scene.volumes?.length || 0);
        this.updateCategoryCount("classifications", 0);
    }

    updateCategoryCount(category, count) {
        const countElement = document.getElementById(category + "Count");
        if (countElement) {
            countElement.textContent = count;
        }
    }

    // ===================================
    // INICIALIZACIÓN DE UI
    // ===================================

    initializeUI() {
        // Configurar event listeners de formularios en modal unificado
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (signupForm) {
            signupForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // File upload handler
        const fileUpload = document.getElementById('fileUpload');
        if (fileUpload) {
            fileUpload.addEventListener('change', (event) => {
                this.handleFileUpload(event);
            });
        }

        // Profile width sliders
        const profileWidthSlider = document.getElementById("profileWidthSlider");
        if (profileWidthSlider) {
            profileWidthSlider.addEventListener("input", (e) => {
                this.updateProfileWidth(e.target.value);
            });
        }

        const profileWidthSliderRight = document.getElementById("profileWidthSliderRight");
        if (profileWidthSliderRight) {
            profileWidthSliderRight.addEventListener("input", (e) => {
                this.updateProfileWidth(e.target.value);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && this.isViewerLoaded) {
                switch(e.key) {
                    case 'd': e.preventDefault(); this.activateTool('distance'); break;
                    case 'u': e.preventDefault(); this.activateTool('area'); break;
                    case 'h': e.preventDefault(); this.activateTool('height'); break;
                    case 'a': e.preventDefault(); this.activateTool('angle'); break;
                    case 'p': e.preventDefault(); this.activateTool('profile'); break;
                    case '.': e.preventDefault(); this.activateTool('point'); break;
                    case 'n': e.preventDefault(); this.activateTool('annotation'); break;
                    case 'v': e.preventDefault(); this.activateTool('volume'); break;
                }
            }
        });

        // Cerrar modal unificado al hacer clic fuera
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('authModal');
            if (modal && event.target === modal) {
                this.closeAuthModal();
            }
        });

        // Update export categories periodically
        setInterval(() => {
            if (this.isViewerLoaded) {
                this.updateMeasurementsList();
                this.updateAnnotationsList();
                this.updateAllExportCategories();
            }
        }, 2000);

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

// ===================================
// INSTANCIA GLOBAL Y INICIALIZACIÓN
// ===================================

let viizorApp;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando Viizor Cloud...');
    viizorApp = new ViizorApp();

    // Inicializar módulo de anotaciones cuando el viewer esté listo
    setTimeout(() => {
        if (viizorApp && viizorApp.viewer) {
            window.annotationInSitu = new AnnotationInSitu(viizorApp);
            console.log("✅ Módulo AnnotationInSitu activado");
        }
    }, 2000);
});

// Exponer funciones globales necesarias para compatibilidad con HTML
window.viizorApp = viizorApp;
