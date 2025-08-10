// Módulo de Anotaciones In-Situ para Viizor
class AnnotationInSitu {
    constructor(viizorApp) {
        this.app = viizorApp;
        this.annotationMode = false;
        this.activeEditor = null;
        this.currentAnnotation = null;
        this.init();
        this.setupStyles();
    }
    
    init() {
        this.app.originalCreateAnnotation = this.app.createAnnotation;
        this.app.createAnnotation = () => this.createAnnotation();
        this.setupEventListener();
    }
    
    setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .floating-editor {
                position: absolute;
                background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(26, 26, 46, 0.95));
                border: 2px solid #3b82f6;
                border-radius: 8px;
                padding: 15px;
                z-index: 1000;
                min-width: 250px;
                backdrop-filter: blur(8px);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            }
            .floating-editor input, .floating-editor textarea {
                width: 100%;
                margin: 5px 0;
                padding: 8px;
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: 4px;
                color: white;
                background: rgba(255,255,255,0.1);
                font-family: inherit;
            }
            .floating-editor button {
                margin: 5px;
                padding: 8px 15px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            }
            .save-btn { background: #3b82f6; color: white; }
            .cancel-btn { background: #666; color: white; }
            .editor-title { color: #3b82f6; margin-bottom: 10px; font-weight: 600; }
        `;
        document.head.appendChild(style);
    }
    
    createAnnotation() {
        this.annotationMode = true;
        this.app.updateStatus('📍 Modo Anotación ACTIVO - Haz clic en la nube de puntos');
        
        const canvas = this.app.viewer.renderer.domElement;
        if (canvas) canvas.style.cursor = 'crosshair';
    }
    
    setupEventListener() {
        if (!this.app.viewer || !this.app.viewer.renderer) return;
        
        this.app.viewer.renderer.domElement.addEventListener('mousedown', (event) => {
            if (this.annotationMode && event.button === 0) {
                this.handleAnnotationClick(event);
            }
        });
    }
    
    handleAnnotationClick(event) {
        const mouse = this.app.viewer.inputHandler.mouse;
        const camera = this.app.viewer.scene.getActiveCamera();
        const hit = Potree.Utils.getMousePointCloudIntersection(
            mouse, camera, this.app.viewer, this.app.viewer.scene.pointclouds
        );
        
        if (hit !== null) {
            // Crear anotación usando patrón de Potree
            this.currentAnnotation = new Potree.Annotation({
                position: [hit.location.x, hit.location.y, hit.location.z],
                title: '',
                description: ''
            });
            
            this.app.viewer.scene.annotations.add(this.currentAnnotation);
            
            // Mostrar editor flotante
            this.showFloatingEditor(event.clientX, event.clientY);
            
            // Desactivar modo
            this.annotationMode = false;
            this.app.viewer.renderer.domElement.style.cursor = 'default';
        }
    }
    
    showFloatingEditor(x, y) {
        const editor = document.createElement('div');
        editor.className = 'floating-editor';
        editor.style.left = `${Math.min(x + 10, window.innerWidth - 300)}px`;
        editor.style.top = `${Math.min(y + 10, window.innerHeight - 200)}px`;
        
        editor.innerHTML = `
            <div class="editor-title">📍 Nueva Anotación</div>
            <input type="text" id="annotation-title" placeholder="Título de la anotación..." maxlength="100">
            <textarea id="annotation-desc" placeholder="Descripción detallada..." rows="3" maxlength="500"></textarea>
            <div>
                <button class="save-btn">✓ Guardar</button>
                <button class="cancel-btn">✕ Cancelar</button>
            </div>
        `;
        
        document.body.appendChild(editor);
        this.activeEditor = editor;
        
        // Event listeners
        const saveBtn = editor.querySelector('.save-btn');
        const cancelBtn = editor.querySelector('.cancel-btn');
        const titleInput = editor.querySelector('#annotation-title');
        
        saveBtn.addEventListener('click', () => this.saveAnnotation());
        cancelBtn.addEventListener('click', () => this.cancelAnnotation());
        
        // Keyboard shortcuts
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('annotation-desc').focus();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeEditor) {
                this.cancelAnnotation();
            }
        });
        
        titleInput.focus();
    }
    
    saveAnnotation() {
        const title = document.getElementById('annotation-title').value.trim();
        const desc = document.getElementById('annotation-desc').value.trim();
        
        if (!title) {
            alert('El título es obligatorio');
            return;
        }
        
        // USAR SETTERS DE POTREE (SIN GUIÓN BAJO)
        this.currentAnnotation.title = title;
        this.currentAnnotation.description = desc;
        
        // Actualizar lista del panel (sincronización)
        this.app.updateAnnotationsList();
        this.app.updateStatus(`✅ Anotación "${title}" creada exitosamente`);
        
        this.closeEditor();
    }
    
    cancelAnnotation() {
        if (this.currentAnnotation) {
            this.app.viewer.scene.annotations.remove(this.currentAnnotation);
            this.currentAnnotation = null;
        }
        this.app.updateStatus('❌ Anotación cancelada');
        this.closeEditor();
    }
    
    closeEditor() {
        if (this.activeEditor) {
            this.activeEditor.remove();
            this.activeEditor = null;
            this.currentAnnotation = null;
        }
    }
}
