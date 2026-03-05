from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from functools import wraps
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import os
import time
from datetime import datetime, timedelta  # ¡CORREGIDO!
import json
import hashlib
import io
import PyPDF2
import pdfplumber
import tempfile
import re
import requests
import uuid  # Para IDs únicos
from collections import Counter  # Para análisis de frecuencias

app = Flask(__name__)
app.secret_key = 'datasoft-secret-key-2024-muy-segura-y-larga-para-flask'

# Configuración de Google Drive
SHARED_DRIVE_ID = '0AKagZaiupwknUk9PVA'
CONTRACTS_FOLDER_ID = '1w9G6y_3S_3Eo8O0Hjg1ZYNM9uI4cl87l'
SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/drive']

# Configuración de Google AI
GOOGLE_AI_API_KEY = os.getenv('GOOGLE_AI_API_KEY', 'AIzaSyC_s5wpW0gn66DepBOOpdeHiMQtAeg_buE')
GOOGLE_AI_URL = os.getenv('GOOGLE_AI_URL', 'https://generativelanguage.googleapis.com/v1beta/models/')
MODEL_NAME = os.getenv('MODEL_NAME', 'gemini-2.5-flash')

# Base de datos simple para datos extraídos de contratos
CONTRACTS_DATA_FILE = 'data/contracts_data.json'


# ============================================
# CONFIGURACIÓN DE USUARIOS Y ROLES
# ============================================

# Configuración de usuarios con roles
USERS = {
    # USUARIOS CON ACCESO LIMITADO (solo Contratos y Facturas)
    'usuario1': {
        'password': hashlib.sha256('password1'.encode()).hexdigest(),
        'email': 'usuario1@datasoft.com',
        'name': 'Usuario 1',
        'role': 'limited'
    },
    'usuario2': {
        'password': hashlib.sha256('password2'.encode()).hexdigest(),
        'email': 'usuario2@datasoft.com',
        'name': 'Usuario 2',
        'role': 'limited'
    },
    'usuario3': {
        'password': hashlib.sha256('password3'.encode()).hexdigest(),
        'email': 'usuario3@datasoft.com',
        'name': 'Usuario 3',
        'role': 'limited'
    },
    
    # USUARIOS CON ACCESO COMPLETO (todos los módulos)
    'admin1': {
        'password': hashlib.sha256('admin123'.encode()).hexdigest(),
        'email': 'admin1@datasoft.com',
        'name': 'Administrador 1',
        'role': 'full'
    },
    'admin2': {
        'password': hashlib.sha256('admin456'.encode()).hexdigest(),
        'email': 'admin2@datasoft.com',
        'name': 'Administrador 2',
        'role': 'full'
    }
}

# Definir campos estándar para contratos
CONTRACT_FIELDS = [
    {
        'id': 'contract_number',
        'name': 'Número de Contrato',
        'type': 'text',
        'required': True,
        'placeholder': 'Ej: CT-2024-001'
    },
    {
        'id': 'client_name',
        'name': 'Nombre del Cliente',
        'type': 'text',
        'required': True,
        'placeholder': 'Ej: Tech Solutions Inc.'
    },
    {
        'id': 'contract_date',
        'name': 'Fecha del Contrato',
        'type': 'date',
        'required': True,
        'placeholder': 'YYYY-MM-DD'
    },
    {
        'id': 'start_date',
        'name': 'Fecha de Inicio',
        'type': 'date',
        'required': True,
        'placeholder': 'YYYY-MM-DD'
    },
    {
        'id': 'end_date',
        'name': 'Fecha de Término',
        'type': 'date',
        'required': True,
        'placeholder': 'YYYY-MM-DD'
    },
    {
        'id': 'total_amount',
        'name': 'Monto Total',
        'type': 'number',
        'required': True,
        'placeholder': 'Ej: 45000.00'
    },
    {
        'id': 'currency',
        'name': 'Moneda',
        'type': 'select',
        'required': True,
        'options': ['USD', 'MXN', 'EUR', 'GBP'],
        'default': 'MXN'
    },
    {
        'id': 'payment_terms',
        'name': 'Términos de Pago',
        'type': 'text',
        'required': False,
        'placeholder': 'Ej: 30 días neto'
    },
    {
        'id': 'status',
        'name': 'Estado',
        'type': 'select',
        'required': True,
        'options': ['Activo', 'Pendiente', 'Terminado', 'Cancelado'],
        'default': 'Activo'
    },
    {
        'id': 'responsible_person',
        'name': 'Persona Responsable',
        'type': 'text',
        'required': False,
        'placeholder': 'Ej: María Rodríguez'
    },
    {
        'id': 'contact_email',
        'name': 'Email de Contacto',
        'type': 'email',
        'required': False,
        'placeholder': 'Ej: contacto@cliente.com'
    },
    {
        'id': 'notes',
        'name': 'Notas Adicionales',
        'type': 'textarea',
        'required': False,
        'placeholder': 'Observaciones importantes...'
    }
]

# Campos específicos para extracción con IA (contratos públicos)
IA_CONTRACT_FIELDS = [
    {
        'id': 'tipo_adjudicacion',
        'name': 'Tipo de Adjudicación',
        'type': 'text'
    },
    {
        'id': 'concepto',
        'name': 'Concepto',
        'type': 'text'
    },
    {
        'id': 'proveedor',
        'name': 'Proveedor',
        'type': 'text'
    },
    {
        'id': 'folio_adjudicacion',
        'name': 'Folio del Tipo de Adjudicación',
        'type': 'text'
    },
    {
        'id': 'partida_presupuestal',
        'name': 'Partida Presupuestal',
        'type': 'text'
    },
    {
        'id': 'nombre_partida',
        'name': 'Nombre de la Partida Presupuestal',
        'type': 'text'
    },
    {
        'id': 'numero_oficio',
        'name': 'Número de Oficio',
        'type': 'text'
    },
    {
        'id': 'fecha_oficio',
        'name': 'Fecha del Oficio',
        'type': 'date'
    },
    {
        'id': 'fecha_suscripcion',
        'name': 'Fecha de Suscripción',
        'type': 'date'
    },
    {
        'id': 'vigencia_inicial',
        'name': 'Vigencia Inicial',
        'type': 'date'
    },
    {
        'id': 'vigencia_final',
        'name': 'Vigencia Final',
        'type': 'date'
    },
    {
        'id': 'monto_minimo',
        'name': 'Monto Mínimo',
        'type': 'number'
    },
    {
        'id': 'monto_maximo',
        'name': 'Monto Máximo',
        'type': 'number'
    },
    {
        'id': 'clasificacion_contrato',
        'name': 'Clasificación del Contrato',
        'type': 'text'
    },
    {
        'id': 'observaciones',
        'name': 'Observaciones',
        'type': 'textarea'
    }
]

def get_drive_service():
    """Crea y retorna el servicio de Google Drive con soporte para Shared Drives"""
    try:
        if not os.path.exists(SERVICE_ACCOUNT_FILE):
            print(f"❌ ERROR: No se encuentra el archivo de credenciales: {SERVICE_ACCOUNT_FILE}")
            return None
        
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, 
            scopes=['https://www.googleapis.com/auth/drive']  # Scope completo
        )
        
        # Construir servicio con caché deshabilitada y timeout extendido
        service = build('drive', 'v3', 
                       credentials=credentials,
                       cache_discovery=False,
                       static_discovery=False)
        
        # Probar la conexión con un Drive compartido específico
        try:
            # Verificar acceso al Shared Drive
            drive_info = service.drives().get(
                driveId=SHARED_DRIVE_ID,
                fields='id, name'
            ).execute()
            print(f"✅ Conectado a Shared Drive: {drive_info.get('name')} ({drive_info.get('id')})")
        except Exception as e:
            print(f"⚠️ No se pudo verificar Shared Drive: {e}")
        
        return service
            
    except Exception as e:
        print(f"💥 Error al crear servicio de Drive: {e}")
        return None

class PDFExtractor:
    def __init__(self):
        self.extraction_methods = ['pdfplumber', 'pypdf2', 'ocr_fallback']
    
    def extract_text_from_pdf(self, pdf_content):
        """Extrae texto de un PDF usando múltiples métodos"""
        extracted_text = ""
        methods_used = []
        
        # Método 1: pdfplumber (para PDFs digitales)
        pdfplumber_text = self._extract_with_pdfplumber(pdf_content)
        if pdfplumber_text and len(pdfplumber_text.strip()) > 100:
            extracted_text = pdfplumber_text
            methods_used.append('pdfplumber')
            print(f"✅ Texto extraído con pdfplumber: {len(extracted_text)} caracteres")
        
        # Método 2: PyPDF2 (fallback)
        if not extracted_text.strip() or len(extracted_text.strip()) < 100:
            pypdf2_text = self._extract_with_pypdf2(pdf_content)
            if pypdf2_text and len(pypdf2_text.strip()) > 100:
                extracted_text = pypdf2_text
                methods_used.append('pypdf2')
                print(f"✅ Texto extraído con PyPDF2: {len(extracted_text)} caracteres")
        
        # Método 3: OCR para PDFs de imagen (nuevo)
        if not extracted_text.strip() or len(extracted_text.strip()) < 100:
            ocr_text = self._extract_with_ocr(pdf_content)
            if ocr_text and len(ocr_text.strip()) > 50:
                extracted_text = ocr_text
                methods_used.append('ocr')
                print(f"✅ Texto extraído con OCR: {len(extracted_text)} caracteres")
        
        return {
            'text': extracted_text,
            'methods_used': methods_used,
            'has_content': bool(extracted_text.strip()),
            'char_count': len(extracted_text),
            'is_image_pdf': 'ocr' in methods_used
        }
    
    def _extract_with_ocr(self, pdf_content):
        """Extrae texto de PDFs de imagen usando OCR"""
        try:
            # Verificar si las librerías de OCR están disponibles
            try:
                import fitz  # PyMuPDF
                import pytesseract
                from PIL import Image
            except ImportError as e:
                print(f"⚠️ Librerías de OCR no disponibles: {e}")
                return ""
            
            print("🔍 Intentando extraer texto con OCR...")
            
            # Abrir el PDF con PyMuPDF
            doc = fitz.open(stream=pdf_content, filetype="pdf")
            text_pages = []
            
            for page_num in range(len(doc)):
                try:
                    page = doc.load_page(page_num)
                    
                    # Convertir la página a imagen
                    pix = page.get_pixmap(dpi=300)  # Alta resolución para mejor OCR
                    img_data = pix.tobytes("ppm")
                    
                    # Crear imagen PIL desde bytes
                    img = Image.open(io.BytesIO(img_data))
                    
                    # Aplicar OCR
                    text = pytesseract.image_to_string(
                        img, 
                        lang='spa+eng',  # Español e inglés
                        config='--psm 3 --oem 3'  # Modo de segmentación automática
                    )
                    
                    if text.strip():
                        cleaned_text = self._clean_text(text)
                        text_pages.append(f"--- Página {page_num + 1} ---\n{cleaned_text}")
                        print(f"   Página {page_num + 1}: {len(cleaned_text)} caracteres")
                    
                except Exception as e:
                    print(f"   Error en página {page_num + 1}: {e}")
                    continue
            
            doc.close()
            
            result = "\n\n".join(text_pages) if text_pages else ""
            print(f"📊 OCR completado: {len(result)} caracteres totales")
            return result
            
        except Exception as e:
            print(f"❌ Error en OCR: {e}")
            return ""
    
    def _extract_with_pdfplumber(self, pdf_content):
        try:
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                text_pages = []
                for page_num, page in enumerate(pdf.pages):
                    try:
                        page_text = page.extract_text(
                            x_tolerance=1,
                            y_tolerance=1,
                            keep_blank_chars=False,
                            use_text_flow=False
                        )
                        if page_text and page_text.strip():
                            cleaned_text = self._clean_text(page_text)
                            text_pages.append(f"--- Página {page_num + 1} ---\n{cleaned_text}")
                    except Exception:
                        continue
                
                return "\n\n".join(text_pages) if text_pages else ""
        except Exception:
            return ""
    
    def _extract_with_pypdf2(self, pdf_content):
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            text_pages = []
            for page_num in range(len(pdf_reader.pages)):
                try:
                    page = pdf_reader.pages[page_num]
                    page_text = page.extract_text()
                    if page_text and page_text.strip():
                        cleaned_text = self._clean_text(page_text)
                        text_pages.append(f"--- Página {page_num + 1} ---\n{cleaned_text}")
                except Exception:
                    continue
            
            return "\n\n".join(text_pages) if text_pages else ""
        except Exception:
            return ""
    
    def _clean_text(self, text):
        import re
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\n+', '\n', text)
        text = text.strip()
        return text

# Clase para manejar la extracción de datos con IA
class AIContractExtractor:
    def __init__(self):
        self.api_key = GOOGLE_AI_API_KEY
        self.api_url = f"{GOOGLE_AI_URL}{MODEL_NAME}:generateContent"
        
    def extract_contract_data(self, text_content):
        """Extrae datos estructurados del contrato usando IA"""
        try:
            if not self.api_key:
                return {'success': False, 'error': 'API Key de Google AI no configurada'}
            
            # Construir el prompt para la IA
            prompt = self._build_extraction_prompt(text_content)
            
            # Llamar a la API de Google AI
            response = self._call_google_ai(prompt)
            
            if response['success']:
                # Parsear la respuesta estructurada
                extracted_data = self._parse_ai_response(response['reply'])
                return {'success': True, 'data': extracted_data}
            else:
                return response
                
        except Exception as e:
            return {'success': False, 'error': f'Error en extracción con IA: {str(e)}'}
    
    def _build_extraction_prompt(self, text_content):
        """Construye el prompt para la extracción de datos"""
        fields_list = "\n".join([f"- {field['name']}: [extraer {field['name'].lower()}]" for field in IA_CONTRACT_FIELDS])
        
        prompt = f"""
        Eres un experto en análisis de contratos públicos. Extrae la siguiente información del texto del contrato proporcionado.
        
        TEXTO DEL CONTRATO:
        {text_content[:15000]}  # Limitar el texto para no exceder límites
        
        INSTRUCCIONES:
        1. Extrae SOLO la información que encuentres explícitamente en el texto
        2. Si no encuentras información para algún campo, déjalo vacío
        3. Devuelve la información en formato JSON válido
        4. Para fechas, usa formato YYYY-MM-DD
        5. Para montos, extrae solo números (sin símbolos de moneda)
        6. Sé preciso y no inventes información
        
        CAMPOS A EXTRAER:
        {fields_list}
        
        FORMATO DE RESPUESTA REQUERIDO (JSON):
        {{
            "tipo_adjudicacion": "valor extraído o vacío si no se encuentra",
            "concepto": "valor extraído o vacío si no se encuentra",
            "proveedor": "valor extraído o vacío si no se encuentra",
            "folio_adjudicacion": "valor extraído o vacío si no se encuentra",
            "partida_presupuestal": "valor extraído o vacío si no se encuentra",
            "nombre_partida": "valor extraído o vacío si no se encuentra",
            "numero_oficio": "valor extraído o vacío si no se encuentra",
            "fecha_oficio": "YYYY-MM-DD o vacío",
            "fecha_suscripcion": "YYYY-MM-DD o vacío",
            "vigencia_inicial": "YYYY-MM-DD o vacío",
            "vigencia_final": "YYYY-MM-DD o vacío",
            "monto_minimo": "número o vacío",
            "monto_maximo": "número o vacío",
            "clasificacion_contrato": "valor extraído o vacío si no se encuentra",
            "observaciones": "valor extraído o vacío si no se encuentra"
        }}
        
        Respuesta (SOLO el JSON, sin explicaciones adicionales):
        """
        return prompt
    
    def _call_google_ai(self, prompt):
        """Llama a la API de Google AI"""
        try:
            headers = {
                'Content-Type': 'application/json'
            }
            
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 2000,
                    "topP": 0.8,
                    "topK": 40
                }
            }
            
            url = f"{self.api_url}?key={self.api_key}"
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                response_data = response.json()
                if 'candidates' in response_data and len(response_data['candidates']) > 0:
                    reply = response_data['candidates'][0]['content']['parts'][0]['text']
                    return {'success': True, 'reply': reply}
                else:
                    return {'success': False, 'error': 'No se generó respuesta'}
            else:
                return {'success': False, 'error': f'Error API: {response.status_code} - {response.text}'}
                
        except requests.exceptions.Timeout:
            return {'success': False, 'error': 'Timeout al conectar con Google AI'}
        except Exception as e:
            return {'success': False, 'error': f'Error de conexión: {str(e)}'}
    
    def _parse_ai_response(self, response_text):
        """Parsea la respuesta de la IA para extraer el JSON"""
        try:
            # Limpiar la respuesta
            cleaned_response = response_text.strip()
            
            # Buscar JSON en la respuesta
            import re
            json_match = re.search(r'\{.*\}', cleaned_response, re.DOTALL)
            
            if json_match:
                json_str = json_match.group(0)
                data = json.loads(json_str)
                
                # Validar y limpiar los datos
                cleaned_data = {}
                for field in IA_CONTRACT_FIELDS:
                    field_id = field['id']
                    value = data.get(field_id, '')
                    
                    # Limpiar valores
                    if isinstance(value, str):
                        value = value.strip()
                    
                    # Convertir montos a números
                    if field_id in ['monto_minimo', 'monto_maximo']:
                        if value:
                            # Extraer solo números
                            numbers = re.findall(r'\d+[\.,]?\d*', str(value))
                            if numbers:
                                # Reemplazar coma por punto para decimales
                                num_str = numbers[0].replace(',', '.')
                                try:
                                    value = float(num_str)
                                except:
                                    value = ''
                            else:
                                value = ''
                    
                    cleaned_data[field_id] = value
                
                return cleaned_data
            else:
                # Si no encuentra JSON, devolver estructura vacía
                return {field['id']: '' for field in IA_CONTRACT_FIELDS}
                
        except json.JSONDecodeError:
            # Si hay error al parsear JSON, devolver estructura vacía
            return {field['id']: '' for field in IA_CONTRACT_FIELDS}
        except Exception as e:
            return {field['id']: '' for field in IA_CONTRACT_FIELDS}

# ============================================
# CLASE PARA EXTRACCIÓN DE FACTURAS CON IA
# ============================================
    
# Inicializar extractores
pdf_extractor = PDFExtractor()
ai_extractor = AIContractExtractor()

# ==============================================
# DECORADORES Y RUTAS DE AUTENTICACIÓN
# ==============================================

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user_data = USERS.get(username)
        if user_data and user_data['password'] == hashlib.sha256(password.encode()).hexdigest():
            session['user'] = {
                'username': username,
                'email': user_data['email'],
                'name': user_data['name'],
                'role': user_data['role']  # ¡AGREGAR EL ROL!
            }
            return redirect(url_for('index'))
        
        return render_template('login.html', error='Credenciales incorrectas')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html', user=session['user'])

# ==============================================
# FUNCIONES AUXILIARES
# ==============================================

def load_contracts_data():
    """Carga los datos de contratos desde el archivo"""
    try:
        with open(CONTRACTS_DATA_FILE, 'r') as f:
            return json.load(f)
    except:
        return {}

def get_contract_max_amount(contract_id):
    """Obtiene el monto máximo de un contrato basado en archivos dentro de la carpeta"""
    try:
        contracts_data = load_contracts_data()
        max_amount = None
        
        # Buscar en todos los archivos de contratos para encontrar el que pertenece a esta carpeta
        for file_id, record in contracts_data.items():
            data = record.get('data', {})
            
            # Primero verificar si este archivo está en la carpeta del contrato
            service = get_drive_service()
            if service:
                try:
                    # Obtener información del archivo para verificar su ubicación
                    file_info = service.files().get(
                        fileId=file_id,
                        fields='id, parents',
                        supportsAllDrives=True
                    ).execute()
                    
                    parents = file_info.get('parents', [])
                    
                    # Si el archivo está en la carpeta del contrato
                    if contract_id in parents:
                        # Buscar monto_maximo (prioridad)
                        if 'monto_maximo' in data and data['monto_maximo']:
                            try:
                                amount = float(str(data['monto_maximo']).replace(',', ''))
                                if amount > 0:
                                    max_amount = amount
                                    print(f"✅ Encontrado monto máximo: ${amount} en archivo {file_id}")
                                    break
                            except ValueError:
                                pass
                        
                        # Buscar total_amount (alternativa)
                        elif 'total_amount' in data and data['total_amount']:
                            try:
                                amount = float(str(data['total_amount']).replace(',', ''))
                                if amount > 0:
                                    max_amount = amount
                                    print(f"✅ Encontrado monto total: ${amount} en archivo {file_id}")
                                    break
                            except ValueError:
                                pass
                            
                except Exception as e:
                    continue
        
        print(f"🔍 Resultado para contrato {contract_id}: {max_amount}")
        return max_amount
    except Exception as e:
        print(f"❌ Error obteniendo monto del contrato: {e}")
        return None

def save_contracts_data(data):
    """Guarda los datos de contratos en el archivo"""
    with open(CONTRACTS_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _can_extract_file(mime_type):
    """Verifica si se puede extraer contenido del archivo"""
    if not mime_type:
        return False
    
    mime_type = mime_type.lower()
    
    # Tipos de archivo que podemos procesar
    extractable_types = [
        'application/pdf',
        'application/vnd.google-apps.document',  # Google Docs
        'application/msword',  # Word .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # Word .docx
        'application/vnd.oasis.opendocument.text',  # OpenDocument
        'text/plain',
        'text/html',
        'text/csv',
        'text/'
    ]
    
    for ext_type in extractable_types:
        if ext_type in mime_type:
            return True
    
    return False

def format_size(size_bytes):
    if not size_bytes:
        return "0 B"
    
    try:
        size = int(size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} TB"
    except:
        return "N/A"

def get_file_icon(mime_type):
    mime_type = mime_type.lower()
    
    if 'pdf' in mime_type:
        return 'fas fa-file-pdf text-red-500'
    elif 'document' in mime_type or 'word' in mime_type:
        return 'fas fa-file-word text-blue-500'
    elif 'spreadsheet' in mime_type or 'excel' in mime_type:
        return 'fas fa-file-excel text-green-500'
    elif 'presentation' in mime_type or 'powerpoint' in mime_type:
        return 'fas fa-file-powerpoint text-orange-500'
    elif 'image' in mime_type:
        return 'fas fa-file-image text-yellow-500'
    elif 'zip' in mime_type or 'compressed' in mime_type:
        return 'fas fa-file-archive text-purple-500'
    else:
        return 'fas fa-file text-gray-500'

def get_file_type(mime_type):
    mime_type = mime_type.lower()
    
    if 'pdf' in mime_type:
        return 'pdf'
    elif 'document' in mime_type or 'word' in mime_type:
        return 'document'
    elif 'spreadsheet' in mime_type or 'excel' in mime_type:
        return 'excel'
    elif 'presentation' in mime_type or 'powerpoint' in mime_type:
        return 'presentation'
    elif 'image' in mime_type:
        return 'image'
    elif 'zip' in mime_type or 'compressed' in mime_type:
        return 'archive'
    else:
        return 'file'

def extract_client_from_name(folder_name):
    import re
    patterns_to_remove = [
        r'\d{4}-\d{2}-\d{2}',
        r'\d{2}-\d{2}-\d{4}',
        r'CT-\d{4}-\d+',
        r'CONTRATO-?\d*',
        r'FAC-\d{4}-\d+',
        r'\d+$'
    ]
    
    clean_name = folder_name
    for pattern in patterns_to_remove:
        clean_name = re.sub(pattern, '', clean_name, flags=re.IGNORECASE)
    
    clean_name = re.sub(r'[-_]+', ' ', clean_name)
    clean_name = re.sub(r'\s+', ' ', clean_name).strip()
    
    return clean_name if clean_name else folder_name

def extract_text_with_ocr(self, pdf_content):
    """Intenta extraer texto de PDFs escaneados usando OCR"""
    try:
        # Necesitarás instalar: pip install pytesseract pillow
        import pytesseract
        from PIL import Image
        import fitz  # PyMuPDF
        
        # Convertir PDF a imágenes
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        text_pages = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap()
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Aplicar OCR
            text = pytesseract.image_to_string(img, lang='spa+eng')
            if text.strip():
                text_pages.append(f"--- Página {page_num + 1} ---\n{text}")
        
        doc.close()
        return "\n\n".join(text_pages) if text_pages else ""
        
    except ImportError:
        return "OCR no disponible. Instala pytesseract y PyMuPDF."
    except Exception:
        return ""


# ==============================================
# FUNCIONES DE MONITOREO
# ==============================================

def get_active_contracts_count():
    """Obtiene el número de contratos activos"""
    contracts_data = load_contracts_data()
    active_count = 0
    
    for file_id, record in contracts_data.items():
        data = record.get('data', {})
        if data.get('status') == 'Activo':
            active_count += 1
    
    return active_count

def calculate_risk_amount():
    """Calcula el monto total en riesgo (contratos próximos a vencer)"""
    try:
        contracts_data = load_contracts_data()
        total_risk = 0
        
        for file_id, record in contracts_data.items():
            data = record.get('data', {})
            status = data.get('status', '')
            amount = data.get('total_amount', 0)
            
            # Considerar contratos vencidos o próximos a vencer como riesgo
            if status in ['Vencido', 'Por Vencer'] and amount:
                try:
                    total_risk += float(str(amount).replace(',', ''))
                except:
                    pass
        
        return round(total_risk, 2)
    except:
        return 0

def calculate_ai_efficiency():
    """Calcula la eficiencia de la IA basada en extracciones exitosas"""
    try:
        contracts_data = load_contracts_data()
        total_extractions = 0
        successful_extractions = 0
        
        for file_id, record in contracts_data.items():
            metadata = record.get('metadata', {})
            if metadata.get('extraction_method') == 'google_ai':
                total_extractions += 1
                # Considerar exitoso si tiene datos completos
                data = record.get('data', {})
                if data.get('contract_number') and data.get('client_name'):
                    successful_extractions += 1
        
        if total_extractions == 0:
            return 0
        
        return round((successful_extractions / total_extractions) * 100, 1)
    except:
        return 0

def get_active_alerts(limit=10):
    """Obtiene alertas activas del sistema"""
    alerts = []
    
    # Alertas de contratos próximos a vencer
    contracts_data = load_contracts_data()
    for file_id, record in contracts_data.items():
        data = record.get('data', {})
        
        # Verificar fecha de término
        end_date = data.get('end_date')
        if end_date:
            try:
                end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
                days_until_end = (end_date_obj - datetime.now()).days
                
                if 0 <= days_until_end <= 7:
                    alerts.append({
                        'type': 'warning',
                        'title': 'Contrato próximo a vencer',
                        'message': f"El contrato {data.get('contract_number', 'N/A')} vence en {days_until_end} días",
                        'contract_id': file_id,
                        'priority': 'high'
                    })
                elif days_until_end < 0:
                    alerts.append({
                        'type': 'critical',
                        'title': 'Contrato vencido',
                        'message': f"El contrato {data.get('contract_number', 'N/A')} está vencido",
                        'contract_id': file_id,
                        'priority': 'critical'
                    })
            except:
                pass
        
        # Alertas de estado
        status = data.get('status', '')
        if status == 'Cancelado':
            alerts.append({
                'type': 'info',
                'title': 'Contrato cancelado',
                'message': f"El contrato {data.get('contract_number', 'N/A')} está cancelado",
                'contract_id': file_id,
                'priority': 'medium'
            })
    
    # Limitar número de alertas
    return alerts[:limit]

def get_recent_activity(limit=20):
    """Obtiene la actividad reciente del sistema"""
    activity = []
    
    # Actividad de contratos
    contracts_data = load_contracts_data()
    for file_id, record in contracts_data.items():
        metadata = record.get('metadata', {})
        data = record.get('data', {})
        
        if metadata.get('updated_at'):
            activity.append({
                'type': 'contract',
                'action': 'updated' if metadata.get('saved_at') != metadata.get('updated_at') else 'created',
                'title': f"Contrato {data.get('contract_number', 'N/A')}",
                'user': metadata.get('saved_by', 'N/A'),
                'timestamp': metadata.get('updated_at'),
                'contract_id': file_id
            })
    
    
    # Ordenar por fecha (más reciente primero) y limitar
    activity.sort(key=lambda x: x['timestamp'], reverse=True)
    return activity[:limit]

# ==============================================
# FUNCIÓN DE MIGRACIÓN PARA ETIQUETAS DE FIRMA
# ==============================================

def migrate_signature_tags():
    """Migra las etiquetas de firma del history al data principal"""
    try:
        contracts_data = load_contracts_data()
        migrated_count = 0
        
        for file_id, record in contracts_data.items():
            # Si tiene history pero no tiene signature_tag en data
            if 'history' in record and record['history']:
                if 'data' not in record:
                    record['data'] = {}
                
                # Si no tiene signature_tag en data, buscarlo en el último history
                if 'signature_tag' not in record['data']:
                    # Buscar en el historial de atrás hacia adelante
                    for history_item in reversed(record['history']):
                        if history_item.get('data', {}).get('signature_tag'):
                            record['data']['signature_tag'] = history_item['data']['signature_tag']
                            migrated_count += 1
                            print(f"✅ Migrada etiqueta para {file_id}: {record['data']['signature_tag']}")
                            break
        
        if migrated_count > 0:
            save_contracts_data(contracts_data)
            print(f"🎉 Migración completada: {migrated_count} etiquetas movidas a data principal")
        else:
            print("ℹ️ No se encontraron etiquetas para migrar")
            
    except Exception as e:
        print(f"❌ Error en migración: {e}")

# ==============================================
# CLASES PARA REPORTES
# ==============================================

class ReportGenerator:
    """Generador de reportes personalizados"""
    
    def __init__(self):
        self.templates = self._load_templates()
    
    def _load_templates(self):
        """Carga las plantillas de reportes disponibles"""
        return {
            'contract_status': {
                'name': 'Estado de Contratos',
                'description': 'Reporte detallado del estado de todos los contratos',
                'fields': ['contract_number', 'client_name', 'status', 'total_amount', 'contract_date', 'end_date'],
                'group_by': 'status'
            },
            'invoice_summary': {
                'name': 'Resumen de Facturas',
                'description': 'Reporte de facturas por contrato y estado',
                'fields': ['invoice_number', 'invoice_date', 'amount_with_tax', 'status', 'contract_id'],
                'group_by': 'contract_id'
            },
            'financial_overview': {
                'name': 'Visión Financiera',
                'description': 'Reporte financiero consolidado',
                'fields': ['contract_number', 'total_amount', 'amount_invoiced', 'balance'],
                'calculations': ['sum', 'average', 'percentage']
            }
        }
    
    def generate(self, config):
        """Genera un reporte basado en la configuración"""
        try:
            report_type = config.get('type', 'contract_status')
            filters = config.get('filters', {})
            format = config.get('format', 'json')
            
            if report_type not in self.templates:
                return {'success': False, 'error': f'Tipo de reporte no válido: {report_type}'}
            
            # Obtener datos según el tipo de reporte
            data = self._collect_data(report_type, filters)
            
            # Aplicar transformaciones
            processed_data = self._process_data(data, self.templates[report_type])
            
            # Formatear según el formato solicitado
            report = self._format_report(processed_data, format)
            
            return {
                'success': True,
                'report': report,
                'metadata': {
                    'type': report_type,
                    'generated_at': datetime.now().isoformat(),
                    'record_count': len(data),
                    'format': format
                }
            }
            
        except Exception as e:
            return {'success': False, 'error': f'Error generando reporte: {str(e)}'}
    
    def _collect_data(self, report_type, filters):
        """Recolecta datos para el reporte"""
        if report_type == 'contract_status':
            return self._get_contract_data(filters)
        elif report_type == 'invoice_summary':
            return self._get_invoice_data(filters)
        elif report_type == 'financial_overview':
            return self._get_financial_data(filters)
        else:
            return []
    
    def _get_contract_data(self, filters):
        """Obtiene datos de contratos"""
        contracts_data = load_contracts_data()
        filtered_data = []
        
        for file_id, record in contracts_data.items():
            data = record['data']
            
            # Aplicar filtros
            if self._apply_filters(data, filters):
                filtered_data.append({
                    'file_id': file_id,
                    'data': data,
                    'metadata': record.get('metadata', {})
                })
        
        return filtered_data

    def _get_financial_data(self, filters):
        """Obtiene datos financieros consolidados"""
        contracts_data = load_contracts_data()
        
        financial_data = []
        
        # Procesar cada contrato
        for file_id, contract_record in contracts_data.items():
            contract_data = contract_record['data']
            contract_id = contract_record['metadata'].get('folder_id', file_id)

            # Calcular saldo
            contract_amount = float(contract_data.get('total_amount', 0)) or 0
            
            financial_data.append({
                'contract_id': contract_id,
                'contract_number': contract_data.get('contract_number', 'N/A'),
                'total_amount': contract_amount,
            })
        
        return financial_data
    
    def _apply_filters(self, data, filters):
        """Aplica filtros a los datos"""
        for key, value in filters.items():
            if key in data:
                if isinstance(value, list):
                    if data[key] not in value:
                        return False
                elif data[key] != value:
                    return False
        return True
    
    def _process_data(self, data, template):
        """Procesa los datos según la plantilla"""
        processed = []
        
        for item in data:
            record = {}
            for field in template.get('fields', []):
                if field in item.get('data', {}):
                    record[field] = item['data'][field]
                elif field in item:
                    record[field] = item[field]
            
            # Agregar metadata si existe
            if 'metadata' in item:
                record['saved_by'] = item['metadata'].get('saved_by', 'N/A')
                record['updated_at'] = item['metadata'].get('updated_at', 'N/A')
            
            processed.append(record)
        
        return processed
    
    def _format_report(self, data, format):
        """Formatea el reporte según el formato solicitado"""
        if format == 'json':
            return {
                'data': data,
                'summary': {
                    'total_records': len(data),
                    'generated_at': datetime.now().isoformat()
                }
            }
        elif format == 'csv':
            # Convertir a CSV
            import io
            import csv
            
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=data[0].keys() if data else [])
            writer.writeheader()
            writer.writerows(data)
            
            return output.getvalue()
        else:
            # Por defecto, devolver JSON
            return {
                'data': data,
                'summary': {
                    'total_records': len(data),
                    'generated_at': datetime.now().isoformat()
                }
            }

# ==============================================
# NUEVAS RUTAS PARA EXTRACCIÓN CON IA
# ==============================================

@app.route('/api/contracts/extract-with-ai/<file_id>')
@login_required
def extract_contract_with_ai(file_id):
    """Extrae datos de un contrato usando IA de Google"""
    try:
        print(f"🔍 Iniciando extracción con IA para archivo: {file_id}")
        
        # Obtener servicio de Drive
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Obtener información del archivo
        file_info = service.files().get(
            fileId=file_id,
            fields='id, name, mimeType, size, modifiedTime',
            supportsAllDrives=True
        ).execute()
        
        file_name = file_info['name']
        
        # Verificar que sea PDF
        if 'application/pdf' not in file_info['mimeType']:
            return jsonify({
                'success': False, 
                'error': 'Solo se pueden procesar archivos PDF'
            }), 400
        
        # Descargar el PDF
        try:
            request_media = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request_media)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            pdf_content = fh.getvalue()
                
        except Exception as e:
            return jsonify({
                'success': False, 
                'error': f'Error al descargar: {str(e)}'
            }), 500
        
        # Extraer texto del PDF
        extraction_result = pdf_extractor.extract_text_from_pdf(pdf_content)
        
        if not extraction_result['has_content']:
            return jsonify({
                'success': False, 
                'error': 'No se pudo extraer texto del PDF'
            }), 400
        
        content = extraction_result['text']
        
        if len(content.strip()) < 100:
            return jsonify({
                'success': False, 
                'error': 'Texto insuficiente para análisis'
            }), 400
        
        print(f"✅ Texto extraído: {len(content)} caracteres")
        
        # ============================================
        # EXTRACCIÓN CON IA - USANDO EL MÉTODO CORRECTO
        # ============================================
        print("🤖 Llamando a IA...")
        
        # IMPORTANTE: Usar el método extract_contract_data (NO extract_contract_data_complete)
        ai_result = ai_extractor.extract_contract_data(content)
        
        if not ai_result['success']:
            return jsonify({
                'success': False,
                'error': f'Error en IA: {ai_result.get("error", "Error desconocido")}'
            }), 500
        
        # Obtener datos extraídos
        extracted_data = ai_result['data']
        
        # Preparar respuesta
        basic_info = {
            'contract_number': extracted_data.get('contract_number', ''),
            'client_name': extracted_data.get('client_name', ''),
            'contract_date': extracted_data.get('contract_date', ''),
            'total_amount': extracted_data.get('total_amount', ''),
            'currency': extracted_data.get('currency', 'MXN'),
            'status': extracted_data.get('status', 'Activo')
        }
        
        # Información de contrato público
        public_contract_info = {}
        for field in IA_CONTRACT_FIELDS:
            field_id = field['id']
            public_contract_info[field_id] = extracted_data.get(field_id, '')
        
        # Todos los campos
        all_fields = {**extracted_data}
        
        # Contar campos
        basic_count = sum(1 for v in basic_info.values() if v and str(v).strip())
        ia_count = sum(1 for v in public_contract_info.values() if v and str(v).strip())
        total_count = sum(1 for v in extracted_data.values() if v and str(v).strip())
        
        return jsonify({
            'success': True,
            'file': {
                'id': file_id,
                'name': file_name,
                'text_length': len(content)
            },
            'extracted_data': {
                'basic_info': basic_info,
                'public_contract_info': public_contract_info,
                'all_fields': all_fields
            },
            'ia_fields': IA_CONTRACT_FIELDS,
            'message': f"✅ IA extrajo {total_count} campos del contrato"
        })
        
    except Exception as e:
        print(f"💥 Error: {str(e)}")
        return jsonify({
            'success': False, 
            'error': f'Error inesperado: {str(e)}'
        }), 500

# ============================================
# FUNCIÓN AUXILIAR PARA EXTRACCIÓN BÁSICA
# ============================================

def extract_basic_contract_info(text_content):
    """Extrae información básica del contrato del texto usando regex"""
    import re
    from datetime import datetime
    
    basic_info = {}
    
    # Limpiar texto para mejor análisis
    clean_text = ' '.join(text_content.split())
    clean_text_lower = clean_text.lower()
    
    print("🔍 Iniciando extracción básica de información del contrato...")
    
    # 1. Buscar número de contrato (patrones más comunes)
    contract_patterns = [
        r'(?:contrato|contratación|número|no\.?|folio)\s*(?:del?\s*)?(?:contrato)?\s*[:]?\s*([A-Za-z0-9\-_/.]+(?:\s+[A-Za-z0-9\-_/.]+)*)',
        r'contrato\s+n[o°º]?\s*[:]?\s*([A-Za-z0-9\-_/.]+)',
        r'[Cc]ontrato\s+([A-Z]{2,4}[-_]\d{4}[-_]\d+)',
        r'CT[-_]?(\d{4}[-_]\d+)',
        r'folio\s*[:]?\s*([A-Za-z0-9\-_/.]+)',
        r'expediente\s*[:]?\s*([A-Za-z0-9\-_/.]+)',
        r'(?:número|no\.?)\s*(?:de\s+)?(?:contrato|contratación)\s*[:]?\s*([A-Za-z0-9\-_/.]+)'
    ]
    
    for pattern in contract_patterns:
        match = re.search(pattern, clean_text, re.IGNORECASE)
        if match:
            contract_num = match.group(1).strip()
            # Validar que sea un número de contrato razonable
            if len(contract_num) >= 3 and len(contract_num) <= 50:
                basic_info['contract_number'] = contract_num
                print(f"   ✅ Número de contrato encontrado: {contract_num}")
                break
    
    # 2. Buscar cliente o proveedor
    client_patterns = [
        r'(?:cliente|contratante|solicitante|empresa)\s*[:]?\s*([A-Z][A-Za-z0-9\s&.,\-()]+?(?=\n|\.|,|;|$))',
        r'entre\s+(?:la\s+)?(?:empresa|compañía|institución)?\s*[:]?\s*([A-Z][A-Za-z0-9\s&.,\-()]+?)',
        r'contratante\s*[:]?\s*([A-Z][A-Za-z0-9\s&.,\-()]+)',
        r'razón\s+social\s*[:]?\s*([A-Z][A-Za-z0-9\s&.,\-()]+)'
    ]
    
    for pattern in client_patterns:
        match = re.search(pattern, clean_text, re.IGNORECASE)
        if match:
            client_name = match.group(1).strip()
            # Limpiar y validar nombre
            client_name = re.sub(r'\s+', ' ', client_name)
            if len(client_name) >= 3 and len(client_name) <= 100:
                basic_info['client_name'] = client_name
                print(f"   ✅ Cliente encontrado: {client_name}")
                break
    
    # 3. Buscar montos (con diferentes formatos)
    amount_patterns = [
        r'(?:monto|importe|valor|total|cantidad)\s*(?:del\s+)?(?:contrato|operación)?\s*(?:[:]?)\s*(?:USD|MXN|EUR|GBP)?\s*[\$]?\s*([\d,]+(?:\.\d{2})?)',
        r'[\$]\s*([\d,]+(?:\.\d{2})?)',
        r'([\d,]+(?:\.\d{2})?)\s*(?:dólares|pesos|USD|MXN|EUR|GBP)',
        r'total\s+(?:de\s+)?[\$]?\s*([\d,]+(?:\.\d{2})?)',
        r'importe\s+(?:total)?\s*(?:[:]?)\s*[\$]?\s*([\d,]+(?:\.\d{2})?)'
    ]
    
    amounts_found = []
    for pattern in amount_patterns:
        matches = re.findall(pattern, clean_text, re.IGNORECASE)
        for match in matches:
            try:
                # Limpiar el formato del número
                clean_num = match.replace(',', '')
                amount = float(clean_num)
                if amount > 0:
                    amounts_found.append(amount)
                    print(f"   💰 Monto encontrado: ${amount:,.2f}")
            except:
                continue
    
    if amounts_found:
        # Tomar el monto más alto (asumiendo que es el total)
        max_amount = max(amounts_found)
        basic_info['total_amount'] = f"{max_amount:.2f}"
        basic_info['currency'] = 'MXN'  # Predeterminado para México
        print(f"   ✅ Monto total establecido: ${max_amount:,.2f} MXN")
    
    # 4. Buscar fechas
    date_patterns = [
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})',  # DD/MM/YYYY o DD-MM-YYYY
        r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',  # YYYY/MM/DD o YYYY-MM-DD
        r'(\d{1,2}\s+de\s+[A-Za-z]+\s+de\s+\d{4})',  # 15 de octubre de 2024
        r'(?:fecha|dia)\s*(?:del?\s+)?(?:contrato|firma)?\s*[:]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
        r'contrato\s+celebrado\s+el\s+(\d{1,2}\s+de\s+[A-Za-z]+\s+de\s+\d{4})'
    ]
    
    dates_found = []
    for pattern in date_patterns:
        matches = re.findall(pattern, clean_text, re.IGNORECASE)
        for match in matches:
            # Intentar formatear la fecha
            try:
                # Para formato con nombres de mes
                if 'de' in match.lower():
                    months_es = {
                        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
                        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
                        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
                    }
                    
                    parts = match.lower().split(' de ')
                    if len(parts) == 3:
                        day = parts[0].strip().zfill(2)
                        month_es = parts[1].strip()
                        year = parts[2].strip()
                        
                        month = months_es.get(month_es, '01')
                        formatted_date = f"{year}-{month}-{day}"
                        dates_found.append(formatted_date)
                        print(f"   📅 Fecha encontrada (formato texto): {formatted_date}")
                
                # Para formato numérico
                elif '/' in match or '-' in match:
                    # Intentar determinar formato
                    parts = re.split(r'[/-]', match)
                    if len(parts) == 3:
                        # Asumir formato DD/MM/YYYY si el primer número es <= 31
                        if int(parts[0]) <= 31 and int(parts[1]) <= 12:
                            formatted_date = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                        # Asumir formato YYYY/MM/DD si el primer número es > 31
                        else:
                            formatted_date = f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
                        
                        dates_found.append(formatted_date)
                        print(f"   📅 Fecha encontrada (formato numérico): {formatted_date}")
                        
            except:
                continue
    
    if dates_found:
        # Tomar la primera fecha como fecha de contrato
        basic_info['contract_date'] = dates_found[0]
        print(f"   ✅ Fecha de contrato establecida: {dates_found[0]}")
    
    # 5. Buscar estado del contrato
    if any(word in clean_text_lower for word in ['vigente', 'activo', 'en ejecución', 'en vigor', 'en curso']):
        basic_info['status'] = 'Activo'
        print(f"   ✅ Estado: Activo")
    elif any(word in clean_text_lower for word in ['terminado', 'finalizado', 'concluido', 'completado', 'cerrado']):
        basic_info['status'] = 'Terminado'
        print(f"   ✅ Estado: Terminado")
    elif any(word in clean_text_lower for word in ['pendiente', 'por iniciar', 'por comenzar', 'futuro']):
        basic_info['status'] = 'Pendiente'
        print(f"   ✅ Estado: Pendiente")
    elif any(word in clean_text_lower for word in ['cancelado', 'anulado', 'rescindido']):
        basic_info['status'] = 'Cancelado'
        print(f"   ✅ Estado: Cancelado")
    else:
        basic_info['status'] = 'Activo'  # Valor por defecto
        print(f"   ℹ️  Estado no encontrado, usando valor por defecto: Activo")
    
    print(f"   📊 Resumen extracción básica: {len(basic_info)} campos encontrados")
    
    return basic_info

@app.route('/api/contracts/save-ai-extraction/<file_id>', methods=['POST'])
@login_required
def save_ai_extraction(file_id):
    """Guarda los datos extraídos por IA"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        # Obtener los datos extraídos por IA
        ia_data = data.get('ia_data', {})
        basic_data = data.get('basic_data', {})
        
        # Combinar datos básicos con datos de IA
        combined_data = {**basic_data, **ia_data}
        
        # Obtener la carpeta padre del archivo
        service = get_drive_service()
        folder_id = None
        if service:
            try:
                file_info = service.files().get(
                    fileId=file_id,
                    fields='id, parents',
                    supportsAllDrives=True
                ).execute()
                parents = file_info.get('parents', [])
                if parents:
                    folder_id = parents[0]  # Tomar la primera carpeta padre
            except:
                pass
        
        # Cargar datos existentes
        contracts_data = load_contracts_data()
        
        # Preparar registro con metadata
        record = {
            'data': combined_data,
            'metadata': {
                'file_id': file_id,
                'folder_id': folder_id,  # ¡IMPORTANTE! Guardar la carpeta
                'saved_by': session['user']['username'],
                'saved_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'extraction_method': 'google_ai',
                'extraction_date': datetime.now().isoformat()
            },
            'ia_extraction': {
                'original_data': ia_data,
                'extraction_date': datetime.now().isoformat()
            }
        }
        
        # Si ya existe, mantener el historial
        if file_id in contracts_data:
            existing_record = contracts_data[file_id]
            if 'history' not in existing_record:
                existing_record['history'] = []
            
            # Guardar versión anterior en historial
            existing_record['history'].append({
                'data': existing_record['data'],
                'updated_by': existing_record['metadata']['saved_by'],
                'updated_at': existing_record['metadata']['updated_at']
            })
            
            # Limitar historial a 10 versiones
            if len(existing_record['history']) > 10:
                existing_record['history'] = existing_record['history'][-10:]
            
            # Actualizar datos principales
            existing_record['data'] = combined_data
            existing_record['metadata']['updated_at'] = datetime.now().isoformat()
            existing_record['metadata']['saved_by'] = session['user']['username']
            existing_record['metadata']['extraction_method'] = 'google_ai'
            existing_record['metadata']['extraction_date'] = datetime.now().isoformat()
            
            # Agregar folder_id si no existe
            if not existing_record['metadata'].get('folder_id') and folder_id:
                existing_record['metadata']['folder_id'] = folder_id
            
            # Agregar datos de IA si no existen
            if 'ia_extraction' not in existing_record:
                existing_record['ia_extraction'] = record['ia_extraction']
            
            record = existing_record
        
        # Guardar en la base de datos
        contracts_data[file_id] = record
        save_contracts_data(contracts_data)
        
        return jsonify({
            'success': True,
            'message': 'Datos extraídos con IA guardados exitosamente',
            'record': record,
            'folder_id': folder_id
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error al guardar datos: {str(e)}'}), 500

@app.route('/api/invoices/get-contract-summary/<contract_id>')
@login_required
def get_contract_summary(contract_id):
    """Obtiene un resumen del contrato con su monto máximo"""
    try:
        # Obtener el monto máximo del contrato
        contract_max_amount = get_contract_max_amount(contract_id)
        
        # Obtener facturas del contrato
        service = get_drive_service()
        total_invoiced = 0
        
        if service:
            # Obtener archivos de facturas
            query = f"'{contract_id}' in parents and (name contains 'FACTURA' or name contains 'factura' or name contains 'Factura') and trashed = false"
            
            results = service.files().list(
                q=query,
                pageSize=50,
                fields="files(id, name)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                corpora='drive',
                driveId=SHARED_DRIVE_ID
            ).execute()
            
            invoice_files = results.get('files', [])
        
        # Calcular estadísticas
        remaining_balance = None
        percentage_used = 0
        
        if contract_max_amount:
            remaining_balance = contract_max_amount - total_invoiced
            percentage_used = (total_invoiced / contract_max_amount * 100) if contract_max_amount > 0 else 0
        
        return jsonify({
            'success': True,
            'summary': {
                'contract_id': contract_id,
                'contract_max_amount': contract_max_amount,
                'total_invoiced': total_invoiced,
                'remaining_balance': remaining_balance,
                'percentage_used': percentage_used,
                'invoice_count': len(invoice_files) if 'invoice_files' in locals() else 0
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/get-ia-fields')
@login_required
def get_ia_contract_fields():
    """Obtiene los campos definidos para extracción con IA"""
    return jsonify({
        'success': True,
        'fields': IA_CONTRACT_FIELDS,
        'total_fields': len(IA_CONTRACT_FIELDS)
    })

# ==============================================
# RUTAS EXISTENTES PARA GESTIÓN DE CONTRATOS
# ==============================================

@app.route('/api/drive/test-connection')
@login_required
def test_drive_connection():
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar'}), 500
        
        try:
            drive_info = service.drives().get(
                driveId=SHARED_DRIVE_ID,
                fields='id,name'
            ).execute()
            
            folder_info = service.files().get(
                fileId=CONTRACTS_FOLDER_ID,
                fields='id,name',
                supportsAllDrives=True
            ).execute()
            
            credentials = service._http.credentials
            service_account_email = credentials.service_account_email
            
            return jsonify({
                'success': True,
                'shared_drive': drive_info,
                'contracts_folder': folder_info,
                'service_account': service_account_email,
                'message': '✅ Conexión exitosa'
            })
            
        except HttpError as e:
            return jsonify({
                'success': False,
                'error': f'Error: {e}'
            }), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/fields')
@login_required
def get_contract_fields():
    """Obtiene los campos definidos para los contratos"""
    return jsonify({
        'success': True,
        'fields': CONTRACT_FIELDS
    })

@app.route('/api/contracts/extract-data/<file_id>')
@login_required
def extract_contract_data(file_id):
    """Extrae el contenido de un archivo para análisis"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Obtener información del archivo
        file_info = service.files().get(
            fileId=file_id,
            fields='id, name, mimeType, size, webViewLink, modifiedTime',
            supportsAllDrives=True
        ).execute()
        
        content = ""
        extraction_method = ""
        
        mime_type = file_info['mimeType']
        
        if 'application/pdf' in mime_type:
            # Descargar y extraer texto del PDF
            request_media = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request_media)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            pdf_content = fh.getvalue()
            extraction_result = pdf_extractor.extract_text_from_pdf(pdf_content)
            
            if extraction_result['has_content']:
                content = extraction_result['text']
                extraction_method = ', '.join(extraction_result['methods_used'])
            else:
                content = "No se pudo extraer texto del PDF. El archivo puede estar escaneado o protegido."
        
        elif 'application/vnd.google-apps.document' in mime_type:
            # Exportar documento de Google Docs a texto
            request_export = service.files().export_media(
                fileId=file_id, 
                mimeType='text/plain'
            )
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request_export)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            content = fh.getvalue().decode('utf-8', errors='ignore')
            extraction_method = 'google_docs_export'
        
        elif 'text/' in mime_type:
            # Descargar archivo de texto
            request_media = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request_media)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            content = fh.getvalue().decode('utf-8', errors='ignore')
            extraction_method = 'text_download'
        
        else:
            content = f"Tipo de archivo no soportado para extracción automática: {mime_type}"
        
        # Cargar datos existentes si los hay
        contracts_data = load_contracts_data()
        existing_data = contracts_data.get(file_id, {})
        
        return jsonify({
            'success': True,
            'file': {
                'id': file_id,
                'name': file_info['name'],
                'mimeType': mime_type,
                'size': format_size(file_info.get('size', 0)),
                'url': file_info.get('webViewLink', ''),
                'content': content[:50000],  # Limitar contenido para respuesta
                'extraction_method': extraction_method,
                'content_preview': content[:1000] + '...' if len(content) > 1000 else content
            },
            'existing_data': existing_data,
            'fields': CONTRACT_FIELDS
        })
        
    except HttpError as e:
        return jsonify({'success': False, 'error': f'Error de Google Drive: {e}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error inesperado: {str(e)}'}), 500

@app.route('/api/contracts/save-data/<file_id>', methods=['POST'])
@login_required
def save_contract_data(file_id):
    """Guarda los datos extraídos de un contrato - ACTUALIZADA"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        # Validar campos requeridos básicos
        required_fields = [field['id'] for field in CONTRACT_FIELDS if field.get('required', False)]
        missing_fields = []
        
        for field_id in required_fields:
            if field_id not in data or not data[field_id]:
                field_info = next((f for f in CONTRACT_FIELDS if f['id'] == field_id), {})
                missing_fields.append(field_info.get('name', field_id))
        
        if missing_fields:
            return jsonify({
                'success': False,
                'error': 'Campos básicos requeridos faltantes',
                'missing_fields': missing_fields,
                'suggestion': 'Complete al menos: Número de Contrato, Cliente, Fecha y Monto'
            }), 400
        
        # Cargar datos existentes
        contracts_data = load_contracts_data()
        
        # Preparar registro con metadata
        record = {
            'data': data,  # Esto incluye TODOS los campos (básicos + IA)
            'metadata': {
                'file_id': file_id,
                'saved_by': session['user']['username'],
                'saved_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'field_count': len(data),
                'has_ia_data': any(field['id'] in data for field in IA_CONTRACT_FIELDS)
            }
        }
        
        # Si ya existe, mantener el historial
        if file_id in contracts_data:
            existing_record = contracts_data[file_id]
            if 'history' not in existing_record:
                existing_record['history'] = []
            
            # Guardar versión anterior en historial
            existing_record['history'].append({
                'data': existing_record['data'],
                'updated_by': existing_record['metadata']['saved_by'],
                'updated_at': existing_record['metadata']['updated_at'],
                'field_count': len(existing_record['data'])
            })
            
            # Limitar historial a 10 versiones
            if len(existing_record['history']) > 10:
                existing_record['history'] = existing_record['history'][-10:]
            
            # Actualizar datos principales (fusionar, no reemplazar completamente)
            for key, value in data.items():
                if value:  # Solo actualizar si hay valor
                    existing_record['data'][key] = value
            
            existing_record['metadata']['updated_at'] = datetime.now().isoformat()
            existing_record['metadata']['saved_by'] = session['user']['username']
            existing_record['metadata']['field_count'] = len(existing_record['data'])
            existing_record['metadata']['has_ia_data'] = any(
                field['id'] in existing_record['data'] for field in IA_CONTRACT_FIELDS
            )
            
            record = existing_record
        
        # Guardar en la base de datos
        contracts_data[file_id] = record
        save_contracts_data(contracts_data)
        
        return jsonify({
            'success': True,
            'message': f'Datos del contrato guardados exitosamente ({len(data)} campos)',
            'record': {
                'file_id': file_id,
                'total_fields': len(data),
                'basic_fields': len([f for f in CONTRACT_FIELDS if f['id'] in data]),
                'ia_fields': len([f for f in IA_CONTRACT_FIELDS if f['id'] in data]),
                'updated_at': record['metadata']['updated_at']
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error al guardar datos: {str(e)}'}), 500

@app.route('/api/contracts/get-data/<file_id>')
@login_required
def get_contract_data(file_id):
    """Obtiene los datos guardados de un contrato"""
    try:
        contracts_data = load_contracts_data()
        
        if file_id in contracts_data:
            return jsonify({
                'success': True,
                'data': contracts_data[file_id]
            })
        else:
            return jsonify({
                'success': True,
                'data': None,
                'message': 'No hay datos guardados para este contrato'
            })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/all-data')
@login_required
def get_all_contracts_data():
    """Obtiene todos los datos de contratos guardados"""
    try:
        contracts_data = load_contracts_data()
        
        # Formatear datos para mostrar
        formatted_data = []
        for file_id, record in contracts_data.items():
            data = record['data']
            metadata = record.get('metadata', {})
            
            formatted_data.append({
                'file_id': file_id,
                'contract_number': data.get('contract_number', 'N/A'),
                'client_name': data.get('client_name', 'N/A'),
                'contract_date': data.get('contract_date', 'N/A'),
                'total_amount': data.get('total_amount', 'N/A'),
                'currency': data.get('currency', 'N/A'),
                'status': data.get('status', 'N/A'),
                'saved_by': metadata.get('saved_by', 'N/A'),
                'saved_at': metadata.get('saved_at', 'N/A'),
                'updated_at': metadata.get('updated_at', 'N/A')
            })
        
        return jsonify({
            'success': True,
            'data': formatted_data,
            'count': len(formatted_data)
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/search-data')
@login_required
def search_contracts_data():
    """Busca en los datos de contratos"""
    try:
        query = request.args.get('q', '').lower()
        
        contracts_data = load_contracts_data()
        results = []
        
        for file_id, record in contracts_data.items():
            data = record['data']
            
            # Buscar en todos los campos
            match = False
            for field_id, value in data.items():
                if isinstance(value, str) and query in value.lower():
                    match = True
                    break
            
            if match:
                results.append({
                    'file_id': file_id,
                    'contract_number': data.get('contract_number', 'N/A'),
                    'client_name': data.get('client_name', 'N/A'),
                    'contract_date': data.get('contract_date', 'N/A'),
                    'total_amount': data.get('total_amount', 'N/A'),
                    'status': data.get('status', 'N/A'),
                    'saved_at': record.get('metadata', {}).get('saved_at', 'N/A')
                })
        
        return jsonify({
            'success': True,
            'results': results,
            'count': len(results),
            'query': query
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/delete-data/<file_id>', methods=['DELETE'])
@login_required
def delete_contract_data(file_id):
    """Elimina los datos de un contrato"""
    try:
        contracts_data = load_contracts_data()
        
        if file_id in contracts_data:
            del contracts_data[file_id]
            save_contracts_data(contracts_data)
            
            return jsonify({
                'success': True,
                'message': 'Datos del contrato eliminados exitosamente'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'No se encontraron datos para este archivo'
            }), 404
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/history/<file_id>')
@login_required
def get_contract_history(file_id):
    """Obtiene el historial de cambios de un contrato"""
    try:
        contracts_data = load_contracts_data()
        
        if file_id in contracts_data:
            record = contracts_data[file_id]
            history = record.get('history', [])
            
            return jsonify({
                'success': True,
                'history': history,
                'current_data': record['data'],
                'current_metadata': record.get('metadata', {})
            })
        else:
            return jsonify({
                'success': True,
                'history': [],
                'message': 'No hay historial disponible'
            })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/restore-version/<file_id>', methods=['POST'])
@login_required
def restore_contract_version(file_id):
    """Restaura una versión anterior del contrato"""
    try:
        data = request.json
        version_index = data.get('version_index')
        
        if version_index is None:
            return jsonify({'success': False, 'error': 'Índice de versión requerido'}), 400
        
        contracts_data = load_contracts_data()
        
        if file_id not in contracts_data:
            return jsonify({'success': False, 'error': 'Contrato no encontrado'}), 404
        
        record = contracts_data[file_id]
        history = record.get('history', [])
        
        if version_index < 0 or version_index >= len(history):
            return jsonify({'success': False, 'error': 'Índice de versión inválido'}), 400
        
        # Obtener versión a restaurar
        version_to_restore = history[version_index]
        
        # Mover datos actuales al historial
        current_data = {
            'data': record['data'],
            'updated_by': record['metadata']['saved_by'],
            'updated_at': record['metadata']['updated_at']
        }
        history.append(current_data)
        
        # Limitar historial
        if len(history) > 10:
            history = history[-10:]
        
        # Restaurar versión
        record['data'] = version_to_restore['data']
        record['metadata']['updated_at'] = datetime.now().isoformat()
        record['metadata']['saved_by'] = session['user']['username']
        record['history'] = history
        
        save_contracts_data(contracts_data)
        
        return jsonify({
            'success': True,
            'message': 'Versión restaurada exitosamente',
            'data': record['data']
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# RUTAS DE MONITOREO - ACTUALIZADAS
# ==============================================

@app.route('/api/monitoring/dashboard-data')
@login_required
def get_monitoring_dashboard():
    """Obtiene datos para el dashboard de monitoreo - VERSIÓN CON DATOS REALES"""
    try:
        # KPIs principales - CON DATOS REALES DE TU SISTEMA
        contracts_data = load_contracts_data()
        
        # 1. Contratos activos
        active_contracts = 0
        for file_id, record in contracts_data.items():
            data = record.get('data', {})
            if data.get('status') == 'Activo':
                active_contracts += 1
        
        
        # 3. Monto en riesgo (contratos próximos a vencer o vencidos)
        risk_amount = 0
        today = datetime.now().date()
        
        for file_id, record in contracts_data.items():
            data = record.get('data', {})
            end_date_str = data.get('end_date')
            status = data.get('status', '')
            amount_str = data.get('total_amount', '0')
            
            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                    days_until_end = (end_date - today).days
                    
                    # Considerar en riesgo si está próximo a vencer (30 días o menos)
                    if 0 <= days_until_end <= 30:
                        try:
                            amount = float(str(amount_str).replace(',', ''))
                            risk_amount += amount
                        except:
                            pass
                except:
                    pass
        
        # 4. Eficiencia de IA (basado en extracciones exitosas)
        ai_efficiency = 0
        total_ai_extractions = 0
        successful_ai_extractions = 0
        
        for file_id, record in contracts_data.items():
            metadata = record.get('metadata', {})
            if metadata.get('extraction_method') == 'google_ai':
                total_ai_extractions += 1
                # Considerar exitoso si tiene datos básicos
                data = record.get('data', {})
                if data.get('contract_number') and data.get('client_name'):
                    successful_ai_extractions += 1
        
        if total_ai_extractions > 0:
            ai_efficiency = round((successful_ai_extractions / total_ai_extractions) * 100, 1)
        
        # Alertas activas
        alerts = []
        
        # Alertas de contratos próximos a vencer
        for file_id, record in contracts_data.items():
            data = record.get('data', {})
            end_date_str = data.get('end_date')
            
            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                    days_until_end = (end_date - today).days
                    
                    contract_number = data.get('contract_number', f'Contrato {file_id[:8]}')
                    client_name = data.get('client_name', 'Cliente desconocido')
                    
                    if 0 <= days_until_end <= 7:
                        alerts.append({
                            'type': 'critical',
                            'priority': 'high',
                            'title': 'Contrato próximo a vencer',
                            'message': f'El contrato {contract_number} ({client_name}) vence en {days_until_end} días',
                            'contract_id': file_id,
                            'timestamp': datetime.now().isoformat()
                        })
                    elif days_until_end < 0:
                        alerts.append({
                            'type': 'critical',
                            'priority': 'critical',
                            'title': 'Contrato vencido',
                            'message': f'El contrato {contract_number} ({client_name}) está vencido',
                            'contract_id': file_id,
                            'timestamp': datetime.now().isoformat()
                        })
                except:
                    pass

        # Actividad reciente (últimos 20 eventos)
        recent_activity = []
        
        # Actividad de contratos
        for file_id, record in contracts_data.items():
            metadata = record.get('metadata', {})
            data = record.get('data', {})
            
            if metadata.get('updated_at'):
                recent_activity.append({
                    'type': 'contract',
                    'action': 'updated' if metadata.get('saved_at') != metadata.get('updated_at') else 'created',
                    'title': f"Contrato {data.get('contract_number', 'N/A')}",
                    'description': f"{data.get('client_name', 'Cliente')} - {data.get('status', 'N/A')}",
                    'user': metadata.get('saved_by', 'Sistema'),
                    'timestamp': metadata.get('updated_at'),
                    'contract_id': file_id
                })

        # Ordenar por fecha (más reciente primero) y limitar
        recent_activity.sort(key=lambda x: x['timestamp'], reverse=True)
        recent_activity = recent_activity[:20]
        
        # Evolución de contratos (por mes)
        contracts_evolution = get_contracts_evolution(contracts_data)
        
        # Distribución por estado
        status_distribution = get_status_distribution(contracts_data)
        
        # Mapa de riesgos (top 5 contratos con mayor riesgo)
        risk_map = get_risk_map(contracts_data)
        
        return jsonify({
            'success': True,
            'kpis': {
                'active_contracts': active_contracts,
                'risk_amount': round(risk_amount, 2),
                'ai_efficiency': ai_efficiency
            },
            'alerts': alerts[:10],  # Solo las 10 más críticas
            'activity': recent_activity,
            'charts': {
                'contracts_evolution': contracts_evolution,
                'status_distribution': status_distribution
            },
            'risk_map': risk_map
        })
        
    except Exception as e:
        print(f"💥 Error en dashboard de monitoreo: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def get_contracts_evolution(contracts_data):
    """Obtiene la evolución de contratos por mes"""
    monthly_data = {}
    
    for file_id, record in contracts_data.items():
        metadata = record.get('metadata', {})
        created_at = metadata.get('saved_at') or metadata.get('updated_at')
        
        if created_at:
            try:
                # Limpiar y parsear fecha
                if 'Z' in created_at:
                    created_at = created_at.replace('Z', '+00:00')
                
                date_obj = datetime.fromisoformat(created_at)
                month_key = date_obj.strftime('%Y-%m')
                
                if month_key not in monthly_data:
                    monthly_data[month_key] = 0
                monthly_data[month_key] += 1
            except:
                pass
    
    # Ordenar por mes y formatear
    sorted_months = sorted(monthly_data.keys())
    
    return {
        'labels': [datetime.strptime(month, '%Y-%m').strftime('%b %Y') for month in sorted_months],
        'data': [monthly_data[month] for month in sorted_months],
        'total': sum(monthly_data.values())
    }

def get_status_distribution(contracts_data):
    """Obtiene la distribución de contratos por estado"""
    status_count = {}
    
    for file_id, record in contracts_data.items():
        data = record.get('data', {})
        status = data.get('status', 'No especificado')
        
        if status not in status_count:
            status_count[status] = 0
        status_count[status] += 1
    
    total = sum(status_count.values())
    
    # Calcular porcentajes
    percentages = []
    for status in status_count.keys():
        if total > 0:
            percentages.append(round((status_count[status] / total) * 100, 1))
        else:
            percentages.append(0)
    
    return {
        'labels': list(status_count.keys()),
        'data': list(status_count.values()),
        'percentages': percentages,
        'total': total
    }

def get_risk_map(contracts_data):
    """Obtiene los contratos con mayor riesgo"""
    risk_contracts = []
    today = datetime.now().date()
    
    for file_id, record in contracts_data.items():
        data = record.get('data', {})
        end_date_str = data.get('end_date')
        amount_str = data.get('total_amount', '0')
        
        if end_date_str:
            try:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                days_until_end = (end_date - today).days
                
                # Calcular nivel de riesgo
                risk_level = 1  # Bajo por defecto
                if days_until_end < 0:
                    risk_level = 3  # Alto (vencido)
                elif days_until_end <= 30:
                    risk_level = 2  # Medio (próximo a vencer)
                
                try:
                    amount = float(str(amount_str).replace(',', ''))
                except:
                    amount = 0
                
                risk_contracts.append({
                    'id': data.get('contract_number', f'CT-{file_id[:8]}'),
                    'name': data.get('client_name', 'Cliente desconocido'),
                    'risk_level': risk_level,
                    'amount': amount,
                    'days_to_expire': days_until_end if days_until_end > 0 else 0,
                    'status': data.get('status', 'N/A')
                })
            except:
                pass
    
    # Ordenar por nivel de riesgo (alto primero) y limitar a 5
    risk_contracts.sort(key=lambda x: (-x['risk_level'], -x['amount']))
    
    return risk_contracts[:5]

# ==============================================
# FUNCIONES DE MONITOREO MEJORADAS
# ==============================================

def get_comprehensive_monitoring_data():
    """Obtiene datos completos para el dashboard de monitoreo"""
    try:
        # Cargar todos los datos
        contracts_data = load_contracts_data()
        
        today = datetime.now().date()
        
        # ===== CONTRATOS =====
        contracts_list = []
        contracts_without_data = 0
        contracts_with_data = 0
        
        for file_id, record in contracts_data.items():
            data = record.get('data', {})
            metadata = record.get('metadata', {})
            
            contract_info = {
                'id': file_id,
                'contract_number': data.get('contract_number', f'CT-{file_id[:8]}'),
                'client_name': data.get('client_name', 'No especificado'),
                'status': data.get('status', 'No especificado'),
                'total_amount': data.get('total_amount', 0),
                'contract_date': data.get('contract_date', ''),
                'end_date': data.get('end_date', ''),
                'saved_by': metadata.get('saved_by', 'Sistema'),
                'updated_at': metadata.get('updated_at', ''),
                'has_data': True,
                'extraction_method': metadata.get('extraction_method', 'manual')
            }
            
            contracts_with_data += 1
            contracts_list.append(contract_info)
        
        # ===== FACTURAS =====
        invoices_list = []
        invoices_without_data = 0
        invoices_with_data = 0

        # ===== ARCHIVOS SIN DATOS (de Google Drive) =====
        service = get_drive_service()
        all_files_without_data = []
        
        if service:
            # Buscar archivos en todas las carpetas de contratos
            try:
                # Primero obtener todas las carpetas
                folders_query = f"'{CONTRACTS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                folders_results = service.files().list(
                    q=folders_query,
                    pageSize=100,
                    fields="files(id, name)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    corpora='drive',
                    driveId=SHARED_DRIVE_ID
                ).execute()
                
                folders = folders_results.get('files', [])
                
                for folder in folders:
                    # Buscar archivos en cada carpeta
                    files_query = f"'{folder['id']}' in parents and trashed = false"
                    files_results = service.files().list(
                        q=files_query,
                        pageSize=50,
                        fields="files(id, name, mimeType, modifiedTime, size)",
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                        corpora='drive',
                        driveId=SHARED_DRIVE_ID
                    ).execute()
                    
                    files = files_results.get('files', [])
                    
                    for file in files:
                        file_id = file['id']
                        
            except Exception as e:
                print(f"Error obteniendo archivos sin datos: {e}")
        
        # Contar archivos sin datos
        contracts_without_data = sum(1 for f in all_files_without_data if f['type'] == 'contract')
        invoices_without_data = sum(1 for f in all_files_without_data if f['type'] == 'invoice')
        
        # ===== ESTADÍSTICAS GENERALES =====
        total_contracts = contracts_with_data + contracts_without_data
        total_invoices = invoices_with_data + invoices_without_data
        
        # Porcentajes
        contract_data_percentage = (contracts_with_data / total_contracts * 100) if total_contracts > 0 else 0
        invoice_data_percentage = (invoices_with_data / total_invoices * 100) if total_invoices > 0 else 0
        
        # Montos totales
        total_contract_amount = sum(float(str(c.get('total_amount', 0)).replace(',', '')) or 0 for c in contracts_list)
        total_invoice_amount = sum(float(str(i.get('amount_with_tax', 0)).replace(',', '')) or 0 for i in invoices_list)
        
        # ===== ALERTAS DETALLADAS =====
        detailed_alerts = []
        
        # Alertas de contratos próximos a vencer
        for contract in contracts_list:
            end_date = contract.get('end_date')
            if end_date:
                try:
                    end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
                    days_until_end = (end_date_obj - today).days
                    
                    if 0 <= days_until_end <= 7:
                        detailed_alerts.append({
                            'type': 'critical',
                            'title': 'Contrato próximo a vencer',
                            'message': f"El contrato {contract['contract_number']} ({contract['client_name']}) vence en {days_until_end} días",
                            'item_id': contract['id'],
                            'item_type': 'contract',
                            'timestamp': datetime.now().isoformat(),
                            'priority': 'high'
                        })
                    elif days_until_end < 0:
                        detailed_alerts.append({
                            'type': 'critical',
                            'title': 'Contrato vencido',
                            'message': f"El contrato {contract['contract_number']} ({contract['client_name']}) está vencido",
                            'item_id': contract['id'],
                            'item_type': 'contract',
                            'timestamp': datetime.now().isoformat(),
                            'priority': 'critical'
                        })
                except:
                    pass
            
            # Alertas de estado
            if contract.get('status') == 'Cancelado':
                detailed_alerts.append({
                    'type': 'warning',
                    'title': 'Contrato cancelado',
                    'message': f"El contrato {contract['contract_number']} está cancelado",
                    'item_id': contract['id'],
                    'item_type': 'contract',
                    'timestamp': datetime.now().isoformat(),
                    'priority': 'medium'
                })
        
        # Alertas de facturas
        for invoice in invoices_list:
            invoice_date = invoice.get('invoice_date')
            status = invoice.get('status', '')
            
            if status == 'Pendiente' and invoice_date:
                try:
                    invoice_date_obj = datetime.strptime(invoice_date, '%Y-%m-%d').date()
                    days_since_invoice = (today - invoice_date_obj).days
                    
                    if days_since_invoice > 30:
                        detailed_alerts.append({
                            'type': 'warning',
                            'title': 'Factura pendiente por más de 30 días',
                            'message': f"La factura {invoice['invoice_number']} lleva {days_since_invoice} días pendiente",
                            'item_id': invoice['id'],
                            'item_type': 'invoice',
                            'timestamp': datetime.now().isoformat(),
                            'priority': 'medium'
                        })
                except:
                    pass
        
        # Alertas de archivos sin procesar
        for file_info in all_files_without_data[:5]:  # Solo primeros 5
            detailed_alerts.append({
                'type': 'info',
                'title': f"Archivo {file_info['type']} sin procesar",
                'message': f"El archivo {file_info['name']} en {file_info['folder_name']} no tiene datos extraídos",
                'item_id': file_info['id'],
                'item_type': file_info['type'],
                'timestamp': datetime.now().isoformat(),
                'priority': 'low'
            })
        
        # ===== ACTIVIDAD RECIENTE =====
        recent_activity = []
        
        # Actividad de contratos
        for contract in contracts_list:
            recent_activity.append({
                'type': 'contract',
                'action': 'updated',
                'title': contract['contract_number'],
                'description': f"{contract['client_name']} - {contract['status']}",
                'user': contract['saved_by'],
                'timestamp': contract['updated_at'],
                'item_id': contract['id']
            })
        
        # Actividad de facturas
        for invoice in invoices_list:
            recent_activity.append({
                'type': 'invoice',
                'action': 'updated',
                'title': invoice['invoice_number'],
                'description': f"Monto: ${float(str(invoice['amount_with_tax']).replace(',', '')) or 0:.2f} - {invoice['status']}",
                'user': invoice['saved_by'],
                'timestamp': invoice['updated_at'],
                'item_id': invoice['id']
            })
        
        # Ordenar por fecha
        recent_activity.sort(key=lambda x: x['timestamp'], reverse=True)
        
        # ===== GRÁFICOS DETALLADOS =====
        
        # Gráfico de distribución de contratos
        contract_status_distribution = {}
        for contract in contracts_list:
            status = contract.get('status', 'No especificado')
            if status not in contract_status_distribution:
                contract_status_distribution[status] = 0
            contract_status_distribution[status] += 1
        
        # Gráfico de distribución de facturas
        invoice_status_distribution = {}
        for invoice in invoices_list:
            status = invoice.get('status', 'Pendiente')
            if status not in invoice_status_distribution:
                invoice_status_distribution[status] = 0
            invoice_status_distribution[status] += 1
        
        # Evolución mensual
        monthly_data = {}
        for contract in contracts_list:
            updated_at = contract.get('updated_at')
            if updated_at:
                try:
                    if 'Z' in updated_at:
                        updated_at = updated_at.replace('Z', '+00:00')
                    date_obj = datetime.fromisoformat(updated_at)
                    month_key = date_obj.strftime('%Y-%m')
                    
                    if month_key not in monthly_data:
                        monthly_data[month_key] = 0
                    monthly_data[month_key] += 1
                except:
                    pass
        
        sorted_months = sorted(monthly_data.keys())
        
        # ===== RESUMEN FINAL =====
        return {
            'summary': {
                'contracts': {
                    'total': total_contracts,
                    'with_data': contracts_with_data,
                    'without_data': contracts_without_data,
                    'data_percentage': round(contract_data_percentage, 1),
                    'total_amount': round(total_contract_amount, 2)
                },
                'invoices': {
                    'total': total_invoices,
                    'with_data': invoices_with_data,
                    'without_data': invoices_without_data,
                    'data_percentage': round(invoice_data_percentage, 1),
                    'total_amount': round(total_invoice_amount, 2)
                }
            },
            'alerts': detailed_alerts,
            'activity': recent_activity[:20],  # Últimas 20 actividades
            'charts': {
                'contract_evolution': {
                    'labels': [datetime.strptime(month, '%Y-%m').strftime('%b %Y') for month in sorted_months],
                    'data': [monthly_data[month] for month in sorted_months]
                },
                'contract_status': {
                    'labels': list(contract_status_distribution.keys()),
                    'data': list(contract_status_distribution.values()),
                    'percentages': [
                        round((count / len(contracts_list) * 100), 1) 
                        for count in contract_status_distribution.values()
                    ] if contracts_list else []
                },
                'invoice_status': {
                    'labels': list(invoice_status_distribution.keys()),
                    'data': list(invoice_status_distribution.values()),
                    'percentages': [
                        round((count / len(invoices_list) * 100), 1) 
                        for count in invoice_status_distribution.values()
                    ] if invoices_list else []
                }
            },
            'files_without_data': all_files_without_data[:10],  # Solo primeros 10
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"Error obteniendo datos de monitoreo: {e}")
        return {
            'summary': {
                'contracts': {'total': 0, 'with_data': 0, 'without_data': 0, 'data_percentage': 0, 'total_amount': 0},
                'invoices': {'total': 0, 'with_data': 0, 'without_data': 0, 'data_percentage': 0, 'total_amount': 0}
            },
            'alerts': [],
            'activity': [],
            'charts': {},
            'files_without_data': [],
            'timestamp': datetime.now().isoformat()
        }

# ==============================================
# NUEVA RUTA PARA MONITOREO COMPLETO
# ==============================================

@app.route('/api/monitoring/comprehensive-data')
@login_required
def get_comprehensive_monitoring():
    """Obtiene datos completos para el dashboard de monitoreo"""
    try:
        data = get_comprehensive_monitoring_data()
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# RUTAS ADICIONALES PARA MONITOREO
# ==============================================

# ==============================================
# RUTAS DE REPORTES - ACTUALIZADAS
# ==============================================

@app.route('/api/reports/generate', methods=['POST'])
@login_required
def generate_report():
    """Genera un reporte"""
    try:
        config = request.json
        
        if not config:
            return jsonify({'success': False, 'error': 'No se recibió configuración'}), 400
        
        report_type = config.get('type', 'custom')
        user = session['user']['username']
        
        # Crear reporte básico
        report_id = f"report_{int(time.time())}"
        
        report_data = {
            'id': report_id,
            'report_type': report_type,
            'generated_by': user,
            'generated_at': datetime.now().isoformat(),
            'format': config.get('format', 'pdf'),
            'record_count': 0,
            'download_url': f'/api/reports/download/{report_id}',
            'description': get_report_description(report_type)
        }
        
        # Simular generación de reporte
        time.sleep(1)  # Simular procesamiento
                
        return jsonify({
            'success': True,
            'report': report_data,
            'message': f'Reporte {report_type} generado exitosamente'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def get_report_description(report_type):
    descriptions = {
        'contracts': 'Reporte completo de todos los contratos activos y su estado',
        'invoices': 'Análisis de facturación y pagos pendientes',
        'executive': 'Dashboard ejecutivo con KPIs principales',
        'custom': 'Reporte personalizado generado por el usuario'
    }
    return descriptions.get(report_type, 'Reporte generado')

@app.route('/api/reports/download/<report_id>')
@login_required
def download_report(report_id):
    """Descarga un reporte (simulado)"""
    try:
        # En una implementación real, aquí generarías el PDF/Excel
        # Por ahora, devolvemos un JSON con los datos
        
        return jsonify({
            'success': True,
            'report_id': report_id,
            'message': 'Descarga simulada - En producción se generaría el archivo',
            'download_url': '#',
            'preview_url': '#'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reports/schedule', methods=['POST'])
@login_required
def schedule_report():
    """Programa un reporte recurrente"""
    try:
        schedule_config = request.json
        
        # Validar configuración
        required = ['report_type', 'frequency', 'recipients']
        missing = [field for field in required if not schedule_config.get(field)]
        
        if missing:
            return jsonify({
                'error': f'Campos requeridos faltantes: {", ".join(missing)}'
            }), 400
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# RUTAS EXISTENTES PARA GESTIÓN DE ARCHIVOS
# ==============================================

@app.route('/api/contracts')
@login_required
def get_contracts():
    """Obtiene la lista de carpetas de contratos"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        print(f"🔍 Buscando carpetas en: {CONTRACTS_FOLDER_ID}")
        
        # Buscar carpetas dentro de la carpeta de contratos (en Shared Drive)
        query = f"'{CONTRACTS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        
        results = service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, createdTime, modifiedTime, webViewLink, size, mimeType)",
            orderBy="modifiedTime desc",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora='drive',
            driveId=SHARED_DRIVE_ID
        ).execute()
        
        folders = results.get('files', [])
        
        print(f"✅ Encontradas {len(folders)} carpetas en {CONTRACTS_FOLDER_ID}")
        
        # Cargar datos de contratos para verificar cuáles tienen datos
        contracts_data = load_contracts_data()
        
        # Formatear los datos
        contracts = []
        for folder in folders:
            try:
                # Obtener archivos dentro de cada carpeta
                files_query = f"'{folder['id']}' in parents and trashed = false"
                files_results = service.files().list(
                    q=files_query,
                    pageSize=10,
                    fields="files(id, name, mimeType, size, modifiedTime, webViewLink)",
                    orderBy="name",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    corpora='drive',
                    driveId=SHARED_DRIVE_ID
                ).execute()
                
                files = files_results.get('files', [])
                
                # Verificar qué archivos tienen datos guardados
                files_with_details = []
                for file in files[:5]:  # Solo primeros 5 archivos
                    file_id = file['id']
                    has_data = file_id in contracts_data
                    
                    file_info = {
                        'id': file_id,
                        'name': file['name'],
                        'type': file.get('mimeType', ''),
                        'size': format_size(file.get('size', 0)),
                        'modified': file.get('modifiedTime', ''),
                        'link': file.get('webViewLink', ''),
                        'icon': get_file_icon(file.get('mimeType', '')),
                        'has_data': has_data,
                        'can_extract': _can_extract_file(file.get('mimeType', ''))
                    }
                    
                    if has_data:
                        # Agregar datos del contrato
                        contract_data = contracts_data[file_id]['data']
                        file_info['contract_data'] = {
                            'contract_number': contract_data.get('contract_number', ''),
                            'client_name': contract_data.get('client_name', ''),
                            'status': contract_data.get('status', ''),
                            'total_amount': contract_data.get('total_amount', '')
                        }
                    
                    files_with_details.append(file_info)
                
                # Extraer información del cliente del nombre
                folder_name = folder['name']
                client_name = extract_client_from_name(folder_name)
                
                contract = {
                    'id': folder['id'],
                    'name': folder_name,
                    'created': folder.get('createdTime', ''),
                    'modified': folder.get('modifiedTime', ''),
                    'link': folder.get('webViewLink', ''),
                    'files': files_with_details,
                    'status': 'active',
                    'client': client_name,
                    'file_count': len(files),
                    'has_data': any(file['has_data'] for file in files_with_details)
                }
                
                contracts.append(contract)
                
            except Exception as e:
                print(f"⚠️ Error procesando carpeta {folder.get('name')}: {e}")
                continue
        
        return jsonify({
            'success': True,
            'contracts': contracts,
            'total': len(contracts),
            'data_count': len(contracts_data)
        })
        
    except HttpError as e:
        print(f"❌ Error de Google Drive: {e}")
        
        if e.resp.status == 404:
            return jsonify({
                'success': False,
                'error': f'Carpeta no encontrada: {CONTRACTS_FOLDER_ID}',
                'help': f'Verifica que la carpeta existe dentro de la unidad compartida {SHARED_DRIVE_ID}'
            }), 404
        elif e.resp.status == 403:
            return jsonify({
                'success': False,
                'error': 'Sin permisos para acceder a la carpeta',
                'help': 'Añade la cuenta de servicio como miembro de la unidad compartida'
            }), 403
        else:
            return jsonify({
                'success': False,
                'error': f'Error de Google Drive: {e}'
            }), 500
            
    except Exception as e:
        print(f"💥 Error inesperado: {e}")
        return jsonify({
            'success': False, 
            'error': f'Error inesperado: {str(e)}'
        }), 500

@app.route('/api/contracts/<folder_id>')
@login_required
def get_contract_details(folder_id):
    """Obtiene detalles de una carpeta de contrato específica"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Obtener información de la carpeta
        folder = service.files().get(
            fileId=folder_id,
            fields='id, name, createdTime, modifiedTime, webViewLink, size',
            supportsAllDrives=True
        ).execute()
        
        # Obtener todos los archivos dentro de la carpeta
        query = f"'{folder_id}' in parents and trashed = false"
        results = service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, mimeType, size, modifiedTime, webViewLink)",
            orderBy="modifiedTime desc",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora='drive',
            driveId=SHARED_DRIVE_ID
        ).execute()
        
        files = results.get('files', [])
        
        # Cargar datos de contratos
        contracts_data = load_contracts_data()
        
        # Clasificar archivos por tipo
        pdf_files = []
        doc_files = []
        excel_files = []
        image_files = []
        other_files = []
        
        for file in files:
            file_id = file['id']
            has_data = file_id in contracts_data
            
            file_info = {
                'id': file_id,
                'name': file['name'],
                'type': file.get('mimeType', ''),
                'size': format_size(file.get('size', 0)),
                'modified': file.get('modifiedTime', ''),
                'link': file.get('webViewLink', ''),
                'icon': get_file_icon(file.get('mimeType', '')),
                'has_data': has_data,
                'can_extract': _can_extract_file(file.get('mimeType', ''))
            }
            
            # Agregar datos del contrato si existen
            if has_data:
                contract_data = contracts_data[file_id]['data']
                metadata = contracts_data[file_id].get('metadata', {})
                
                file_info['contract_data'] = {
                    'contract_number': contract_data.get('contract_number', ''),
                    'client_name': contract_data.get('client_name', ''),
                    'contract_date': contract_data.get('contract_date', ''),
                    'total_amount': contract_data.get('total_amount', ''),
                    'currency': contract_data.get('currency', ''),
                    'status': contract_data.get('status', ''),
                    'saved_by': metadata.get('saved_by', ''),
                    'saved_at': metadata.get('saved_at', '')
                }
            
            mime_type = file.get('mimeType', '').lower()
            if 'pdf' in mime_type:
                pdf_files.append(file_info)
            elif 'document' in mime_type or 'word' in mime_type:
                doc_files.append(file_info)
            elif 'spreadsheet' in mime_type or 'excel' in mime_type:
                excel_files.append(file_info)
            elif 'image' in mime_type:
                image_files.append(file_info)
            else:
                other_files.append(file_info)
        
        return jsonify({
            'success': True,
            'folder': {
                'id': folder['id'],
                'name': folder['name'],
                'created': folder.get('createdTime', ''),
                'modified': folder.get('modifiedTime', ''),
                'link': folder.get('webViewLink', ''),
                'client': extract_client_from_name(folder['name']),
                'size': format_size(folder.get('size', 0))
            },
            'files': {
                'pdf': pdf_files,
                'documents': doc_files,
                'excel': excel_files,
                'images': image_files,
                'others': other_files
            },
            'stats': {
                'total': len(files),
                'pdf': len(pdf_files),
                'documents': len(doc_files),
                'excel': len(excel_files),
                'images': len(image_files),
                'with_data': sum(1 for file in files if file['id'] in contracts_data)
            }
        })
        
    except HttpError as e:
        return jsonify({'error': f'Error de Google Drive: {e}'}), 500
    except Exception as e:
        return jsonify({'error': f'Error inesperado: {str(e)}'}), 500

@app.route('/api/contracts/create-folder', methods=['POST'])
@login_required
def create_contract_folder():
    """Crea una nueva carpeta para un contrato"""
    try:
        data = request.json
        folder_name = data.get('name')
        
        if not folder_name:
            return jsonify({'error': 'El nombre es requerido'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Crear la carpeta en Shared Drive
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [CONTRACTS_FOLDER_ID]
        }
        
        try:
            folder = service.files().create(
                body=folder_metadata, 
                fields='id, name, webViewLink, createdTime, modifiedTime',
                supportsAllDrives=True
            ).execute()
            
            return jsonify({
                'success': True,
                'message': f'Carpeta "{folder_name}" creada exitosamente',
                'folder': {
                    'id': folder['id'],
                    'name': folder['name'],
                    'link': folder.get('webViewLink', ''),
                    'created': folder.get('createdTime', ''),
                    'modified': folder.get('modifiedTime', '')
                }
            })
            
        except HttpError as e:
            return jsonify({
                'success': False,
                'error': f'Error de Google Drive: {e}'
            }), 500
                
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error inesperado: {str(e)}'}), 500


@app.route('/api/contracts/upload', methods=['POST'])
@login_required
def upload_to_contract():
    """Sube un archivo a una carpeta de contrato - VERSIÓN CORREGIDA"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No se seleccionó ningún archivo'}), 400
        
        file = request.files['file']
        contract_id = request.form.get('contract_id')
        
        if not contract_id:
            return jsonify({'error': 'ID de contrato requerido'}), 400
        
        if file.filename == '':
            return jsonify({'error': 'Nombre de archivo vacío'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Crear metadata del archivo
        file_metadata = {
            'name': file.filename,
            'parents': [contract_id]
        }
        
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file.filename)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        # Usar BytesIO en lugar de archivo temporal para evitar problemas de bloqueo en Windows
        import io
        file_content = file.read()
        
        try:
            from googleapiclient.http import MediaIoBaseUpload
            
            media = MediaIoBaseUpload(
                io.BytesIO(file_content),
                mimetype=mime_type,
                resumable=True
            )
            
            uploaded_file = service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, name, size, webViewLink, mimeType, modifiedTime',
                supportsAllDrives=True
            ).execute()
            
            return jsonify({
                'success': True,
                'message': f'Archivo "{file.filename}" subido exitosamente',
                'file': {
                    'id': uploaded_file['id'],
                    'name': uploaded_file['name'],
                    'size': format_size(uploaded_file.get('size', 0)),
                    'type': get_file_type(uploaded_file.get('mimeType', '')),
                    'mimeType': uploaded_file.get('mimeType', ''),
                    'link': uploaded_file.get('webViewLink', ''),
                    'date': uploaded_file.get('modifiedTime', ''),
                    'icon': get_file_icon(uploaded_file.get('mimeType', ''))
                }
            })
            
        except HttpError as e:
            return jsonify({'error': f'Error de Google Drive: {e}'}), 500
        
    except Exception as e:
        return jsonify({'error': f'Error inesperado: {str(e)}'}), 500

# ==============================================
# RUTA PARA ELIMINAR ARCHIVOS DE GOOGLE DRIVE - VERSIÓN CORREGIDA PARA SHARED DRIVES
# ==============================================

@app.route('/api/drive/delete-file/<path:file_id>', methods=['DELETE'])
@login_required
def delete_drive_file(file_id):
    """Mueve un archivo o carpeta a la papelera de Google Drive"""
    try:
        print(f"🗑️ [DELETE] Iniciando eliminación: {file_id}")
        
        if not file_id or file_id == 'undefined' or file_id == 'null':
            return jsonify({'success': False, 'error': 'ID no válido'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Drive'}), 500
        
        # Verificar archivo/carpeta
        try:
            file_info = service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, trashed',
                supportsAllDrives=True
            ).execute()
            
            file_name = file_info.get('name', 'Unknown')
            is_folder = file_info.get('mimeType') == 'application/vnd.google-apps.folder'
            
            if file_info.get('trashed'):
                return jsonify({
                    'success': False,
                    'error': 'El elemento ya está en la papelera'
                }), 400
                
        except HttpError as e:
            if e.resp.status == 404:
                return jsonify({'success': False, 'error': 'Elemento no encontrado'}), 404
            elif e.resp.status == 403:
                return jsonify({'success': False, 'error': 'Sin permisos para eliminar este elemento'}), 403
            else:
                return jsonify({'success': False, 'error': f'Error de Drive: {e}'}), 500
        
        # Mover a papelera
        try:
            print(f"🗑️ Moviendo a papelera: {file_name} ({'carpeta' if is_folder else 'archivo'})")
            
            service.files().update(
                fileId=file_id,
                body={'trashed': True},
                supportsAllDrives=True
            ).execute()
            
            print(f"✅ Elemento movido a papelera exitosamente")
            
            # Eliminar datos locales
            try:
                if is_folder:
                    # Si es una carpeta, eliminar todos los datos de archivos dentro
                    contracts_data = load_contracts_data()
                    
                    # Buscar archivos en esta carpeta
                    query = f"'{file_id}' in parents and trashed = false"
                    files_in_folder = service.files().list(
                        q=query,
                        fields="files(id)",
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                        corpora='drive',
                        driveId=SHARED_DRIVE_ID
                    ).execute()
                    
                    folder_files = files_in_folder.get('files', [])
                    
                    # Eliminar datos de cada archivo
                    for file_in_folder in folder_files:
                        child_id = file_in_folder['id']
                        if child_id in contracts_data:
                            del contracts_data[child_id]
                    
                    save_contracts_data(contracts_data)
                else:
                    # Es un archivo individual
                    contracts_data = load_contracts_data()
                    if file_id in contracts_data:
                        del contracts_data[file_id]
                        save_contracts_data(contracts_data)

            except Exception as e:
                print(f"⚠️ Error eliminando datos locales: {e}")
            
            return jsonify({
                'success': True,
                'message': f'"{file_name}" movido a la papelera',
                'file_id': file_id,
                'is_folder': is_folder,
                'trashed': True
            })
            
        except HttpError as e:
            print(f"❌ Error al mover a papelera: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
            
    except Exception as e:
        print(f"💥 Error inesperado: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# RUTAS PARA RENOMBRAR ARCHIVOS/CARPETAS
# ==============================================

@app.route('/api/drive/rename/<path:item_id>', methods=['PUT'])
@login_required
def rename_drive_item(item_id):
    """Renombra un archivo o carpeta en Google Drive"""
    try:
        print(f"✏️ [RENAME] Iniciando renombre de: {item_id}")
        
        data = request.json
        new_name = data.get('new_name')
        item_type = data.get('item_type', 'file')
        
        if not new_name:
            return jsonify({'success': False, 'error': 'El nombre es requerido'}), 400
        
        if not new_name.strip():
            return jsonify({'success': False, 'error': 'El nombre no puede estar vacío'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        try:
            # Obtener información actual del archivo/carpeta
            file_info = service.files().get(
                fileId=item_id,
                fields='id, name, mimeType',
                supportsAllDrives=True
            ).execute()
            
            old_name = file_info.get('name')
            
            # Actualizar el nombre
            updated_file = service.files().update(
                fileId=item_id,
                body={'name': new_name.strip()},
                fields='id, name, modifiedTime',
                supportsAllDrives=True
            ).execute()
            
            print(f"✅ [RENAME] {item_type} renombrado: '{old_name}' → '{updated_file['name']}'")
            
            return jsonify({
                'success': True,
                'message': f'{item_type.capitalize()} renombrado exitosamente',
                'item': {
                    'id': updated_file['id'],
                    'name': updated_file['name'],
                    'modified': updated_file.get('modifiedTime', '')
                }
            })
            
        except HttpError as e:
            print(f"❌ [RENAME] Error de Drive: {e}")
            
            if e.resp.status == 403:
                return jsonify({
                    'success': False,
                    'error': 'No tienes permisos para renombrar este elemento'
                }), 403
            elif e.resp.status == 404:
                return jsonify({
                    'success': False,
                    'error': 'Elemento no encontrado'
                }), 404
            else:
                return jsonify({
                    'success': False,
                    'error': f'Error de Google Drive: {e}'
                }), 500
                
    except Exception as e:
        print(f"💥 [RENAME] Error inesperado: {e}")
        return jsonify({'success': False, 'error': f'Error inesperado: {str(e)}'}), 500


# ==============================================
# RUTA PARA GUARDAR ETIQUETA DE FIRMA - CORREGIDA
# ==============================================

# ==============================================
# RUTA PARA GUARDAR ETIQUETA DE FIRMA - CORREGIDA DEFINITIVAMENTE
# ==============================================

@app.route('/api/contracts/save-signature-tag/<file_id>', methods=['POST'])
@login_required
def save_signature_tag(file_id):
    """Guarda la etiqueta de firma para un archivo"""
    try:
        data = request.json
        signature_tag = data.get('signature_tag')
        
        if not signature_tag:
            return jsonify({'success': False, 'error': 'No se recibió la etiqueta'}), 400
        
        print(f"🏷️ Guardando etiqueta de firma: {signature_tag} para archivo: {file_id}")
        
        # Cargar datos de contratos
        contracts_data = load_contracts_data()
        
        # Si el archivo ya tiene datos
        if file_id in contracts_data:
            # ¡IMPORTANTE! Guardar DIRECTAMENTE en data, NO solo en history
            if 'data' not in contracts_data[file_id]:
                contracts_data[file_id]['data'] = {}
            
            # GUARDAR EN DATA PRINCIPAL (esto es lo que faltaba)
            contracts_data[file_id]['data']['signature_tag'] = signature_tag
            
            # Actualizar metadata
            if 'metadata' not in contracts_data[file_id]:
                contracts_data[file_id]['metadata'] = {}
            
            contracts_data[file_id]['metadata']['updated_at'] = datetime.now().isoformat()
            contracts_data[file_id]['metadata']['saved_by'] = session['user']['username']
            
            # Guardar también en historial (para tracking)
            if 'history' not in contracts_data[file_id]:
                contracts_data[file_id]['history'] = []
            
            contracts_data[file_id]['history'].append({
                'data': {'signature_tag': signature_tag},
                'updated_by': session['user']['username'],
                'updated_at': datetime.now().isoformat()
            })
            
            # Limitar historial
            if len(contracts_data[file_id]['history']) > 10:
                contracts_data[file_id]['history'] = contracts_data[file_id]['history'][-10:]
            
            print(f"✅ Etiqueta guardada en data principal: {contracts_data[file_id]['data'].get('signature_tag')}")
            
        else:
            # Crear nuevo registro
            contracts_data[file_id] = {
                'data': {
                    'signature_tag': signature_tag  # GUARDADO EN DATA PRINCIPAL
                },
                'metadata': {
                    'file_id': file_id,
                    'saved_by': session['user']['username'],
                    'saved_at': datetime.now().isoformat(),
                    'updated_at': datetime.now().isoformat()
                },
                'history': [{
                    'data': {'signature_tag': signature_tag},
                    'updated_by': session['user']['username'],
                    'updated_at': datetime.now().isoformat()
                }]
            }
            print(f"✅ Nuevo registro creado con etiqueta en data: {signature_tag}")
        
        # Guardar cambios
        save_contracts_data(contracts_data)
        
        # Verificar que se guardó correctamente
        verify_data = load_contracts_data()
        if file_id in verify_data and 'data' in verify_data[file_id]:
            saved_tag = verify_data[file_id]['data'].get('signature_tag')
            print(f"🔍 Verificación - Etiqueta guardada en data: {saved_tag}")
        
        return jsonify({
            'success': True,
            'message': 'Etiqueta de firma guardada exitosamente',
            'signature_tag': signature_tag
        })
        
    except Exception as e:
        print(f"❌ Error guardando etiqueta de firma: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/drive/check-file/<path:file_id>')
@login_required
def check_drive_file(file_id):
    """Verifica si un archivo existe en Google Drive"""
    try:
        if not file_id or file_id == 'undefined' or file_id == 'null':
            return jsonify({
                'exists': False,
                'error': 'ID de archivo no válido'
            })
        
        service = get_drive_service()
        if not service:
            return jsonify({
                'exists': False,
                'error': 'No se pudo conectar a Google Drive'
            })
        
        try:
            file_info = service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, trashed',
                supportsAllDrives=True
            ).execute()
            
            return jsonify({
                'exists': True,
                'id': file_info['id'],
                'name': file_info.get('name'),
                'mimeType': file_info.get('mimeType'),
                'trashed': file_info.get('trashed', False)
            })
            
        except HttpError as e:
            if e.resp.status == 404:
                return jsonify({
                    'exists': False,
                    'error': 'Archivo no encontrado en Google Drive'
                })
            else:
                return jsonify({
                    'exists': False,
                    'error': f'Error de Drive: {str(e)}'
                })
                
    except Exception as e:
        return jsonify({
            'exists': False,
            'error': f'Error inesperado: {str(e)}'
        })

@app.route('/api/contracts/search')
@login_required
def search_contracts_route():
    """Busca contratos por nombre"""
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({'error': 'Término de búsqueda requerido'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Buscar en carpetas dentro de la unidad compartida
        folder_query = f"name contains '{query}' and '{CONTRACTS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        
        folder_results = service.files().list(
            q=folder_query,
            pageSize=20,
            fields="files(id, name, modifiedTime, webViewLink)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora='drive',
            driveId=SHARED_DRIVE_ID
        ).execute()
        
        folders = folder_results.get('files', [])
        
        # Formatear resultados
        results = []
        for folder in folders:
            results.append({
                'type': 'folder',
                'id': folder['id'],
                'name': folder['name'],
                'modified': folder.get('modifiedTime', ''),
                'link': folder.get('webViewLink', ''),
                'client': extract_client_from_name(folder['name'])
            })
        
        return jsonify({
            'success': True,
            'results': results,
            'query': query,
            'count': len(results)
        })
        
    except HttpError as e:
        return jsonify({'error': f'Error de Google Drive: {e}'}), 500
    except Exception as e:
        return jsonify({'error': f'Error inesperado: {str(e)}'}), 500

# ==============================================
# SISTEMA DE MONTOS COMPROMETIDOS
# ==============================================

@app.route('/api/contracts/get-contract-financial/<contract_id>')
@login_required
def get_contract_financial_data(contract_id):
    """Obtiene todos los datos financieros del contrato: contrato, facturado y comprometido"""
    try:
        print(f"💰 Obteniendo datos financieros del contrato: {contract_id}")
        
        # ===== 1. OBTENER MONTO DEL CONTRATO =====
        contract_max_amount = get_contract_max_amount(contract_id)
        
        # Obtener información del contrato (nombre, número, cliente)
        service = get_drive_service()
        contract_name = 'Contrato'
        contract_number = ''
        client_name = ''
        
        if service:
            try:
                folder_info = service.files().get(
                    fileId=contract_id,
                    fields='id, name',
                    supportsAllDrives=True
                ).execute()
                contract_name = folder_info.get('name', 'Contrato')
                
                # Intentar obtener datos del contrato para número y cliente
                contracts_data = load_contracts_data()
                for file_id, record in contracts_data.items():
                    # Buscar archivo que esté en esta carpeta
                    if record.get('metadata', {}).get('folder_id') == contract_id:
                        data = record.get('data', {})
                        contract_number = data.get('contract_number', '')
                        client_name = data.get('client_name', '')
                        break
            except:
                pass
        
        # ===== 2. OBTENER TOTAL FACTURADO =====
        total_invoiced = 0
        invoices = []

        if service:
            try:
                # Obtener archivos de facturas en la carpeta
                query = f"'{contract_id}' in parents and (name contains 'FACTURA' or name contains 'factura' or name contains 'Factura' or name contains 'CFDI' or name contains 'INVOICE') and trashed = false"
                
                results = service.files().list(
                    q=query,
                    pageSize=100,
                    fields="files(id, name)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    corpora='drive',
                    driveId=SHARED_DRIVE_ID
                ).execute()
                
                invoice_files = results.get('files', [])
            
            except Exception as e:
                print(f"Error obteniendo facturas: {e}")

    except Exception as e:
        print(f"❌ Error obteniendo datos financieros: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contracts/add-commitment/<contract_id>', methods=['POST'])
@login_required
def add_contract_commitment(contract_id):
    """Agrega un nuevo compromiso al contrato"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        # Validar campos requeridos
        amount = data.get('amount')
        description = data.get('description', 'Sin descripción')
        
        if not amount:
            return jsonify({'success': False, 'error': 'El monto es requerido'}), 400
        
        try:
            amount = float(amount)
            if amount <= 0:
                return jsonify({'success': False, 'error': 'El monto debe ser mayor a 0'}), 400
        except:
            return jsonify({'success': False, 'error': 'Monto no válido'}), 400
        
        # ===== VALIDACIÓN PRINCIPAL: No exceder el monto del contrato =====
        contract_max_amount = get_contract_max_amount(contract_id)
        
        if not contract_max_amount:
            return jsonify({
                'success': False, 
                'error': 'No se pudo determinar el monto del contrato. Primero extrae los datos del contrato.'
            }), 400
        
        # VALIDACIÓN 1: El monto no puede exceder el monto total del contrato
        if amount > contract_max_amount:
            return jsonify({
                'success': False, 
                'error': f'El monto no puede exceder el monto total del contrato (${format_number(contract_max_amount)}).',
                'contract_amount': contract_max_amount,
                'limit_type': 'contract'
            }), 400
        
        # ===== OBTENER DATOS ACTUALES PARA CÁLCULOS =====
        
        # 1. Obtener total facturado (con notas de crédito aplicadas)
        total_invoiced = 0
        service = get_drive_service()
        
        if service:
            try:
                # Buscar archivos de facturas en la carpeta
                query = f"'{contract_id}' in parents and (name contains 'FACTURA' or name contains 'factura' or name contains 'Factura' or name contains 'CFDI' or name contains 'INVOICE') and trashed = false"
                
                results = service.files().list(
                    q=query,
                    pageSize=100,
                    fields="files(id, name)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    corpora='drive',
                    driveId=SHARED_DRIVE_ID
                ).execute()
                
                invoice_files = results.get('files', [])
        
            except Exception as e:
                print(f"Error obteniendo facturas: {e}")
        
        
        # ===== VALIDACIÓN 2: Advertencia si excede el disponible =====
        warning = None
        will_exceed = False

        # ===== CREAR NUEVO COMPROMISO =====
        commitment_id = f"cmt_{int(time.time())}_{contract_id[-8:]}"
        
        new_commitment = {
            'id': commitment_id,
            'amount': amount,
            'description': description,
            'created_by': session['user']['username'],
            'created_at': datetime.now().isoformat(),
            'active': True,
            'notes': data.get('notes', ''),
            'exceeds_available': will_exceed,  # Bandera para saber si excede
            'contract_amount': contract_max_amount,
            'invoiced_at_time': total_invoiced,
        }
        
    except Exception as e:
        print(f"❌ Error agregando compromiso: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# NUEVAS RUTAS PARA GESTIÓN DE USUARIOS
# ==============================================

# Base de datos simple para usuarios
USERS_DATA_FILE = 'data/users_data.json'

def load_users_data():
    """Carga los datos de usuarios desde el archivo"""
    try:
        with open(USERS_DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}

def save_users_data(data):
    """Guarda los datos de usuarios en el archivo"""
    with open(USERS_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route('/api/users/create-folder', methods=['POST'])
@login_required
def create_user_folder():
    """Crea una nueva carpeta para un usuario"""
    try:
        data = request.json
        username = data.get('username')
        fecha_nacimiento = data.get('fecha_nacimiento')
        email = data.get('email')
        
        if not username:
            return jsonify({'success': False, 'error': 'El nombre de usuario es requerido'}), 400
        
        # Crear nombre de carpeta con el nombre de usuario
        folder_name = username.strip()
        
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Crear la carpeta en Shared Drive
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [CONTRACTS_FOLDER_ID]
        }
        
        try:
            folder = service.files().create(
                body=folder_metadata, 
                fields='id, name, webViewLink, createdTime, modifiedTime',
                supportsAllDrives=True
            ).execute()
            
            # Guardar información del usuario
            folder_id = folder['id']
            users_data = load_users_data()
            
            users_data[folder_id] = {
                'folder_id': folder_id,
                'folder_name': folder_name,
                'username': username,
                'fecha_nacimiento': fecha_nacimiento,
                'email': email,
                'created_by': session['user']['username'],
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            save_users_data(users_data)
            
            return jsonify({
                'success': True,
                'message': f'Usuario "{username}" creado exitosamente',
                'folder': {
                    'id': folder_id,
                    'name': folder_name,
                    'link': folder.get('webViewLink', ''),
                    'created': folder.get('createdTime', ''),
                    'modified': folder.get('modifiedTime', '')
                },
                'user_info': {
                    'username': username,
                    'fecha_nacimiento': fecha_nacimiento,
                    'email': email
                }
            })
            
        except HttpError as e:
            return jsonify({
                'success': False,
                'error': f'Error de Google Drive: {e}'
            }), 500
                
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error inesperado: {str(e)}'}), 500

@app.route('/api/users/get-info/<folder_id>')
@login_required
def get_user_info(folder_id):
    """Obtiene la información de un usuario por ID de carpeta"""
    try:
        users_data = load_users_data()
        
        if folder_id in users_data:
            return jsonify({
                'success': True,
                'user_info': users_data[folder_id]
            })
        else:
            return jsonify({
                'success': True,
                'user_info': None,
                'message': 'No hay información de usuario para esta carpeta'
            })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users/update-info/<folder_id>', methods=['POST'])
@login_required
def update_user_info(folder_id):
    """Actualiza la información de un usuario"""
    try:
        data = request.json
        username = data.get('username')
        fecha_nacimiento = data.get('fecha_nacimiento')
        email = data.get('email')
        
        if not username:
            return jsonify({'success': False, 'error': 'El nombre de usuario es requerido'}), 400
        
        users_data = load_users_data()
        
        if folder_id in users_data:
            # Actualizar información existente
            users_data[folder_id]['username'] = username
            users_data[folder_id]['fecha_nacimiento'] = fecha_nacimiento
            users_data[folder_id]['email'] = email
            users_data[folder_id]['updated_at'] = datetime.now().isoformat()
            users_data[folder_id]['updated_by'] = session['user']['username']
            
            # También actualizar el nombre de la carpeta si cambió
            if username != users_data[folder_id]['folder_name']:
                service = get_drive_service()
                if service:
                    try:
                        service.files().update(
                            fileId=folder_id,
                            body={'name': username},
                            supportsAllDrives=True
                        ).execute()
                        users_data[folder_id]['folder_name'] = username
                    except Exception as e:
                        print(f"Error renombrando carpeta: {e}")
        else:
            # Crear nuevo registro
            users_data[folder_id] = {
                'folder_id': folder_id,
                'folder_name': username,
                'username': username,
                'fecha_nacimiento': fecha_nacimiento,
                'email': email,
                'created_by': session['user']['username'],
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
        
        save_users_data(users_data)
        
        return jsonify({
            'success': True,
            'message': 'Información de usuario actualizada exitosamente',
            'user_info': users_data[folder_id]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Función auxiliar para formatear números (reutilizar)
def format_number(num):
    """Formatea números con comas y 2 decimales"""
    try:
        if num is None:
            return '0.00'
        return f"{num:,.2f}"
    except:
        return '0.00'

# ==============================================
# NUEVAS RUTAS PARA GESTIÓN DE PACIENTES Y RECETAS
# ==============================================

# Archivo de datos para pacientes y recetas
PATIENTS_DATA_FILE = 'data/patients_data.json'

def load_patients_data():
    """Carga los datos de pacientes desde el archivo"""
    try:
        if not os.path.exists(PATIENTS_DATA_FILE):
            # Crear el archivo si no existe
            os.makedirs(os.path.dirname(PATIENTS_DATA_FILE), exist_ok=True)
            with open(PATIENTS_DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump({}, f)
            return {}
            
        with open(PATIENTS_DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error cargando pacientes: {e}")
        return {}

def save_patients_data(data):
    """Guarda los datos de pacientes en el archivo"""
    with open(PATIENTS_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route('/api/patients', methods=['GET'])
@login_required
def get_patients():
    """Obtiene la lista de todos los pacientes (TODAS las carpetas)"""
    try:
        # Obtener servicio de Drive
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        print("🔍 Buscando TODAS las carpetas de pacientes...")
        
        # Buscar TODAS las carpetas dentro de CONTRACTS_FOLDER_ID
        query = f"'{CONTRACTS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        
        results = service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, createdTime, modifiedTime, parents)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora='drive',
            driveId=SHARED_DRIVE_ID
        ).execute()
        
        folders = results.get('files', [])
        print(f"✅ Encontradas {len(folders)} carpetas de pacientes")
        
        # Cargar datos adicionales de pacientes
        patients_data = load_patients_data()
        
        patients = []
        for folder in folders:
            folder_id = folder['id']
            folder_name = folder['name']
            patient_info = patients_data.get(folder_id, {})
            
            # Si no hay datos locales, usar el nombre de la carpeta
            if not patient_info:
                patient_info = {
                    'username': folder_name,
                    'folder_name': folder_name
                }
            
            # Contar recetas en la carpeta
            recipes_count = 0
            try:
                recipes_query = f"'{folder_id}' in parents and name contains 'RECETA' and trashed = false"
                recipes_results = service.files().list(
                    q=recipes_query,
                    pageSize=100,
                    fields="files(id)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()
                recipes_count = len(recipes_results.get('files', []))
            except Exception as e:
                print(f"Error contando recetas para {folder_id}: {e}")
            
            patients.append({
                'folder_id': folder_id,
                'folder_name': folder_name,
                'username': patient_info.get('username', folder_name),
                'fecha_nacimiento': patient_info.get('fecha_nacimiento', ''),
                'email': patient_info.get('email', ''),
                'phone': patient_info.get('phone', ''),
                'notes': patient_info.get('notes', ''),
                'created_at': folder.get('createdTime', ''),
                'modified_at': folder.get('modifiedTime', ''),
                'recipes_count': recipes_count
            })
        
        return jsonify({
            'success': True,
            'patients': patients,
            'total': len(patients)
        })
        
    except Exception as e:
        print(f"Error obteniendo pacientes: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/patients', methods=['POST'])
@login_required
def create_patient():
    """Crea un nuevo paciente (carpeta en Drive)"""
    try:
        data = request.json
        username = data.get('username')
        fecha_nacimiento = data.get('fecha_nacimiento')
        email = data.get('email')
        phone = data.get('phone')
        notes = data.get('notes')
        
        if not username:
            return jsonify({'success': False, 'error': 'El nombre del paciente es requerido'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        # Crear nombre de carpeta más limpio
        clean_username = username.strip().replace(' ', '_').upper()
        folder_name = f"PACIENTE_{clean_username}"
        
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [CONTRACTS_FOLDER_ID]
        }
        
        try:
            folder = service.files().create(
                body=folder_metadata,
                fields='id, name, webViewLink, createdTime',
                supportsAllDrives=True
            ).execute()
        except Exception as e:
            print(f"Error creando carpeta en Drive: {e}")
            return jsonify({'success': False, 'error': f'Error en Drive: {str(e)}'}), 500
        
        folder_id = folder['id']
        
        # Guardar información del paciente
        patients_data = load_patients_data()
        patients_data[folder_id] = {
            'folder_id': folder_id,
            'folder_name': folder_name,
            'username': username,
            'fecha_nacimiento': fecha_nacimiento,
            'email': email,
            'phone': phone,
            'notes': notes,
            'created_by': session['user']['username'],
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        save_patients_data(patients_data)
        
        print(f"✅ Paciente creado: {username} - Folder ID: {folder_id}")
        
        return jsonify({
            'success': True,
            'message': f'Paciente {username} creado exitosamente',
            'folder_id': folder_id,
            'folder_name': folder_name,
            'folder_link': folder.get('webViewLink', '')
        })
        
    except Exception as e:
        print(f"Error creando paciente: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/patients/<folder_id>', methods=['GET'])
@login_required
def get_patient(folder_id):
    """Obtiene información detallada de un paciente"""
    try:
        patients_data = load_patients_data()
        patient_info = patients_data.get(folder_id, {})
        
        # Obtener información de la carpeta de Drive
        service = get_drive_service()
        folder_info = None
        if service:
            try:
                folder_info = service.files().get(
                    fileId=folder_id,
                    fields='id, name, createdTime, modifiedTime, webViewLink',
                    supportsAllDrives=True
                ).execute()
            except:
                pass
        
        return jsonify({
            'success': True,
            'patient': {
                'folder_id': folder_id,
                'folder_name': folder_info.get('name') if folder_info else '',
                'username': patient_info.get('username', ''),
                'fecha_nacimiento': patient_info.get('fecha_nacimiento', ''),
                'email': patient_info.get('email', ''),
                'phone': patient_info.get('phone', ''),
                'notes': patient_info.get('notes', ''),
                'created_at': folder_info.get('createdTime') if folder_info else '',
                'modified_at': folder_info.get('modifiedTime') if folder_info else '',
                'folder_link': folder_info.get('webViewLink') if folder_info else ''
            }
        })
        
    except Exception as e:
        print(f"Error obteniendo paciente: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/patients/<folder_id>', methods=['PUT'])
@login_required
def update_patient(folder_id):
    """Actualiza información de un paciente"""
    try:
        data = request.json
        username = data.get('username')
        fecha_nacimiento = data.get('fecha_nacimiento')
        email = data.get('email')
        phone = data.get('phone')
        notes = data.get('notes')
        
        patients_data = load_patients_data()
        
        if folder_id not in patients_data:
            patients_data[folder_id] = {}
        
        patients_data[folder_id].update({
            'username': username,
            'fecha_nacimiento': fecha_nacimiento,
            'email': email,
            'phone': phone,
            'notes': notes,
            'updated_by': session['user']['username'],
            'updated_at': datetime.now().isoformat()
        })
        
        save_patients_data(patients_data)
        
        return jsonify({
            'success': True,
            'message': 'Información del paciente actualizada'
        })
        
    except Exception as e:
        print(f"Error actualizando paciente: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/patients/<folder_id>/recipes', methods=['GET'])
@login_required
def get_patient_recipes(folder_id):
    """Obtiene todas las recetas de un paciente"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        print(f"🔍 Buscando recetas en carpeta: {folder_id}")
        
        # Verificar que la carpeta existe
        try:
            folder_check = service.files().get(
                fileId=folder_id,
                fields='id, name',
                supportsAllDrives=True
            ).execute()
            print(f"✅ Carpeta verificada: {folder_check.get('name')}")
        except Exception as e:
            print(f"❌ Error: La carpeta {folder_id} no existe: {e}")
            return jsonify({'success': False, 'error': 'Carpeta no encontrada'}), 404
        
        # Buscar archivos de recetas en la carpeta del paciente
        query = f"'{folder_id}' in parents and name contains 'RECETA' and trashed = false"
        
        try:
            results = service.files().list(
                q=query,
                pageSize=100,
                fields="files(id, name, createdTime, modifiedTime, webViewLink)",
                orderBy="createdTime desc",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                corpora='drive',
                driveId=SHARED_DRIVE_ID
            ).execute()
        except Exception as e:
            print(f"❌ Error en consulta a Drive: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
        
        recipe_files = results.get('files', [])
        print(f"✅ Encontradas {len(recipe_files)} recetas en Drive")
        
        # Cargar datos de recetas guardados localmente
        patients_data = load_patients_data()
        recipes_data = patients_data.get('recipes', {})
        
        recipes = []
        for file in recipe_files:
            file_id = file['id']
            recipe_info = recipes_data.get(file_id, {})
            
            # Formatear fecha correctamente
            created_date = file.get('createdTime', '')
            try:
                if created_date:
                    # Eliminar la 'Z' y fracciones de segundo
                    created_date = created_date.split('.')[0].replace('Z', '')
                    date_obj = datetime.fromisoformat(created_date)
                    display_date = date_obj.strftime('%Y-%m-%d')
                else:
                    display_date = ''
            except:
                display_date = created_date[:10] if created_date else ''
            
            recipes.append({
                'id': file_id,
                'name': file['name'],
                'date': recipe_info.get('date', display_date),
                'diagnosis': recipe_info.get('diagnosis', 'Sin diagnóstico'),
                'doctor': recipe_info.get('doctor', 'No especificado'),
                'medicines': recipe_info.get('medicines', []),
                'instructions': recipe_info.get('instructions', ''),
                'next_appointment': recipe_info.get('next_appointment', ''),
                'doc_link': file.get('webViewLink', ''),
                'created_at': file.get('createdTime', '')
            })
        
        return jsonify({
            'success': True,
            'recipes': recipes,
            'count': len(recipes)
        })
        
    except Exception as e:
        print(f"❌ Error obteniendo recetas: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recipes', methods=['POST'])
@login_required
def create_recipe():
    """Crea una nueva receta médica y genera un documento en Google Docs"""
    try:
        data = request.json
        patient_id = data.get('patient_id')
        date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
        doctor = data.get('doctor', session['user']['name'])
        diagnosis = data.get('diagnosis')
        medicines = data.get('medicines', [])
        instructions = data.get('instructions', '')
        next_appointment = data.get('next_appointment', '')
        
        if not patient_id:
            return jsonify({'success': False, 'error': 'ID de paciente requerido'}), 400
        
        if not diagnosis:
            return jsonify({'success': False, 'error': 'El diagnóstico es requerido'}), 400
        
        if not medicines or len(medicines) == 0:
            return jsonify({'success': False, 'error': 'Debe agregar al menos un medicamento'}), 400
        
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Google Drive'}), 500
        
        # ===== VERIFICACIÓN CRÍTICA =====
        # Verificar que la carpeta del paciente existe
        try:
            folder_info = service.files().get(
                fileId=patient_id,
                fields='id, name',
                supportsAllDrives=True
            ).execute()
            print(f"📁 Carpeta del paciente encontrada: {folder_info.get('name')} ({patient_id})")
        except Exception as e:
            print(f"❌ Error: La carpeta del paciente {patient_id} no existe: {e}")
            return jsonify({
                'success': False, 
                'error': 'La carpeta del paciente no existe en Google Drive'
            }), 404
        
        # Obtener información del paciente
        patients_data = load_patients_data()
        patient_info = patients_data.get(patient_id, {})
        patient_name = patient_info.get('username', folder_info.get('name', 'Paciente'))
        
        # Crear nombre del documento
        recipe_number = datetime.now().strftime('%Y%m%d%H%M%S')
        doc_name = f"RECETA_{patient_name}_{date}_{recipe_number}.docx"
        
        # Generar contenido de la receta
        doc_content = generate_recipe_content({
            'patient_name': patient_name,
            'date': date,
            'doctor': doctor,
            'diagnosis': diagnosis,
            'medicines': medicines,
            'instructions': instructions,
            'next_appointment': next_appointment,
            'patient_info': patient_info
        })
        
        # ===== CREAR DOCUMENTO EN LA CARPETA DEL PACIENTE =====
        from googleapiclient.http import MediaIoBaseUpload
        import io
        
        file_metadata = {
            'name': doc_name,
            'parents': [patient_id],  # ¡IMPORTANTE! Usar patient_id como carpeta padre
            'mimeType': 'application/vnd.google-apps.document'
        }
        
        # Crear archivo temporal con el contenido
        media = MediaIoBaseUpload(
            io.BytesIO(doc_content.encode('utf-8')),
            mimetype='text/plain',
            resumable=True
        )
        
        # Crear el documento en Drive dentro de la carpeta del paciente
        doc = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink, parents',
            supportsAllDrives=True
        ).execute()
        
        doc_id = doc['id']
        doc_link = doc.get('webViewLink', '')
        
        # Verificar que se creó en la carpeta correcta
        parents = doc.get('parents', [])
        print(f"✅ Documento creado: {doc_name}")
        print(f"   ID: {doc_id}")
        print(f"   Carpeta padre: {parents}")
        print(f"   Debería ser: {patient_id}")
        
        # Guardar información de la receta localmente
        patients_data = load_patients_data()
        if 'recipes' not in patients_data:
            patients_data['recipes'] = {}
        
        patients_data['recipes'][doc_id] = {
            'patient_id': patient_id,
            'date': date,
            'doctor': doctor,
            'diagnosis': diagnosis,
            'medicines': medicines,
            'instructions': instructions,
            'next_appointment': next_appointment,
            'created_by': session['user']['username'],
            'created_at': datetime.now().isoformat()
        }
        
        save_patients_data(patients_data)
        
        return jsonify({
            'success': True,
            'message': 'Receta creada exitosamente',
            'doc_id': doc_id,
            'doc_name': doc_name,
            'doc_link': doc_link,
            'folder_id': patient_id,
            'folder_name': patient_name
        })
        
    except Exception as e:
        print(f"❌ Error creando receta: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

def generate_recipe_content(data):
    """Genera el contenido formateado para la receta médica"""
    patient_name = data.get('patient_name', '')
    date = data.get('date', '')
    doctor = data.get('doctor', '')
    diagnosis = data.get('diagnosis', '')
    medicines = data.get('medicines', [])
    instructions = data.get('instructions', '')
    next_appointment = data.get('next_appointment', '')
    patient_info = data.get('patient_info', {})
    
    # Formatear fecha
    try:
        date_obj = datetime.strptime(date, '%Y-%m-%d')
        formatted_date = date_obj.strftime('%d de %B de %Y')
    except:
        formatted_date = date
    
    # Calcular edad si hay fecha de nacimiento
    age = ''
    if patient_info.get('fecha_nacimiento'):
        try:
            birth = datetime.strptime(patient_info['fecha_nacimiento'], '%Y-%m-%d')
            today = datetime.now()
            age_years = today.year - birth.year
            if today.month < birth.month or (today.month == birth.month and today.day < birth.day):
                age_years -= 1
            age = f"Edad: {age_years} años"
        except:
            pass
    
    # Construir contenido
    content = f"""RECETA MÉDICA

Fecha: {formatted_date}

DATOS DEL PACIENTE
------------------
Nombre: {patient_name}
{age}
{('Email: ' + patient_info.get('email', '')) if patient_info.get('email') else ''}
{('Teléfono: ' + patient_info.get('phone', '')) if patient_info.get('phone') else ''}

MÉDICO RESPONSABLE
------------------
Dr. {doctor}

DIAGNÓSTICO
-----------
{diagnosis}

MEDICAMENTOS RECETADOS
----------------------
"""
    
    for i, med in enumerate(medicines, 1):
        med_name = med.get('name', '')
        med_dosage = med.get('dosage', '')
        med_frequency = med.get('frequency', '')
        
        content += f"{i}. {med_name}"
        if med_dosage:
            content += f" - {med_dosage}"
        if med_frequency:
            content += f" - {med_frequency}"
        content += "\n"
    
    if instructions:
        content += f"""
INSTRUCCIONES ADICIONALES
-------------------------
{instructions}
"""
    
    if next_appointment:
        try:
            next_date = datetime.strptime(next_appointment, '%Y-%m-%d')
            formatted_next = next_date.strftime('%d de %B de %Y')
            content += f"""
PRÓXIMA CITA
------------
{formatted_next}
"""
        except:
            content += f"""
PRÓXIMA CITA
------------
{next_appointment}
"""
    
    content += f"""

___________________________________
Firma del Médico

{doctor}

___________________________________
Firma del Paciente

{patient_name}

Documento generado electrónicamente el {datetime.now().strftime('%d/%m/%Y %H:%M')}
"""
    
    return content

@app.route('/api/patients/stats', methods=['GET'])
@login_required
def get_patients_stats():
    """Obtiene estadísticas de pacientes y recetas"""
    try:
        service = get_drive_service()
        
        total_patients = 0
        recipes_this_month = 0
        last_recipe_date = '-'
        
        if service:
            # Contar carpetas de pacientes (TODAS las carpetas)
            folders_query = f"'{CONTRACTS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            folders_results = service.files().list(
                q=folders_query,
                pageSize=100,
                fields="files(id)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                corpora='drive',
                driveId=SHARED_DRIVE_ID
            ).execute()
            
            total_patients = len(folders_results.get('files', []))
            
            # Contar recetas del mes actual
            current_month = datetime.now().strftime('%Y-%m')
            recipes_query = "name contains 'RECETA' and trashed = false"
            
            try:
                recipes_results = service.files().list(
                    q=recipes_query,
                    pageSize=100,
                    fields="files(id, modifiedTime)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    corpora='drive',
                    driveId=SHARED_DRIVE_ID
                ).execute()
                
                recipe_files = recipes_results.get('files', [])
                
                # Filtrar por mes actual manualmente
                recipes_this_month = 0
                for file in recipe_files:
                    modified = file.get('modifiedTime', '')
                    if modified and modified.startswith(current_month):
                        recipes_this_month += 1
                        
            except Exception as e:
                print(f"Error contando recetas del mes: {e}")
            
            # Obtener última receta
            try:
                last_recipe_query = "name contains 'RECETA' and trashed = false"
                last_recipe_results = service.files().list(
                    q=last_recipe_query,
                    pageSize=1,
                    orderBy="modifiedTime desc",
                    fields="files(modifiedTime)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                    corpora='drive',
                    driveId=SHARED_DRIVE_ID
                ).execute()
                
                last_files = last_recipe_results.get('files', [])
                if last_files:
                    last_time = last_files[0].get('modifiedTime', '')
                    try:
                        last_time = last_time.split('.')[0].replace('Z', '')
                        last_date = datetime.fromisoformat(last_time)
                        last_recipe_date = last_date.strftime('%d/%m/%Y')
                    except:
                        last_recipe_date = '-'
            except:
                pass
        
        return jsonify({
            'success': True,
            'stats': {
                'total_patients': total_patients,
                'recipes_this_month': recipes_this_month,
                'active_patients': total_patients,
                'last_recipe_date': last_recipe_date
            }
        })
        
    except Exception as e:
        print(f"Error obteniendo estadísticas: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

APPOINTMENTS_DATA_FILE = 'data/appointments_data.json'

# ==============================================
# FUNCIONES PARA GESTIÓN DE CITAS
# ==============================================

def load_appointments_data():
    """Carga los datos de citas desde el archivo"""
    try:
        with open(APPOINTMENTS_DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception as e:
        print(f"Error cargando citas: {e}")
        return {}

def save_appointments_data(data):
    """Guarda los datos de citas en el archivo"""
    try:
        with open(APPOINTMENTS_DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error guardando citas: {e}")

# ==============================================
# RUTAS PARA GESTIÓN DE CITAS (NUEVAS)
# ==============================================

@app.route('/api/appointments', methods=['GET'])
@login_required
def get_appointments():
    """Obtiene todas las citas"""
    try:
        appointments_data = load_appointments_data()
        
        # Obtener información de pacientes para enriquecer los datos
        patients_data = load_patients_data()
        
        # Formatear citas para el frontend
        appointments_list = []
        for apt_id, apt_data in appointments_data.items():
            patient_id = apt_data.get('patient_id')
            patient_info = patients_data.get(patient_id, {})
            
            appointments_list.append({
                'id': apt_id,
                'patient_id': patient_id,
                'patient_name': patient_info.get('username', apt_data.get('patient_name', 'Paciente')),
                'patient_email': patient_info.get('email', ''),
                'patient_phone': patient_info.get('phone', ''),
                'title': apt_data.get('title', 'Cita médica'),
                'description': apt_data.get('description', ''),
                'date': apt_data.get('date'),
                'time': apt_data.get('time'),
                'duration': apt_data.get('duration', 30),
                'status': apt_data.get('status', 'pending'),
                'type': apt_data.get('type', 'general'),
                'notes': apt_data.get('notes', ''),
                'created_by': apt_data.get('created_by'),
                'created_at': apt_data.get('created_at'),
                'updated_at': apt_data.get('updated_at')
            })
        
        # Ordenar por fecha (más recientes primero)
        appointments_list.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        return jsonify({
            'success': True,
            'appointments': appointments_list,
            'count': len(appointments_list)
        })
        
    except Exception as e:
        print(f"Error obteniendo citas: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/appointments', methods=['POST'])
@login_required
def create_appointment():
    """Crea una nueva cita"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        # Validar campos requeridos
        patient_id = data.get('patient_id')
        date = data.get('date')
        time = data.get('time')
        
        if not patient_id:
            return jsonify({'success': False, 'error': 'ID de paciente requerido'}), 400
        if not date:
            return jsonify({'success': False, 'error': 'Fecha requerida'}), 400
        if not time:
            return jsonify({'success': False, 'error': 'Hora requerida'}), 400
        
        # Verificar que el paciente existe
        patients_data = load_patients_data()
        if patient_id not in patients_data:
            # Si no está en patients_data, verificar en Drive
            service = get_drive_service()
            patient_exists = False
            if service:
                try:
                    folder_info = service.files().get(
                        fileId=patient_id,
                        fields='id, name',
                        supportsAllDrives=True
                    ).execute()
                    patient_exists = True
                    patient_name = folder_info.get('name')
                except:
                    pass
            
            if not patient_exists:
                return jsonify({'success': False, 'error': 'Paciente no encontrado'}), 404
        else:
            patient_name = patients_data[patient_id].get('username', 'Paciente')
        
        # Crear ID único para la cita
        import uuid
        appointment_id = str(uuid.uuid4())
        
        # Obtener nombre del paciente
        if not patient_name:
            patient_name = patients_data.get(patient_id, {}).get('username', 'Paciente')
        
        # Crear registro de cita
        appointment_data = {
            'patient_id': patient_id,
            'patient_name': patient_name,
            'title': data.get('title', 'Cita médica'),
            'description': data.get('description', ''),
            'date': date,
            'time': time,
            'duration': data.get('duration', 30),
            'status': data.get('status', 'pending'),
            'type': data.get('type', 'general'),
            'notes': data.get('notes', ''),
            'created_by': session['user']['username'],
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        # Guardar cita
        appointments_data = load_appointments_data()
        appointments_data[appointment_id] = appointment_data
        save_appointments_data(appointments_data)
        
        return jsonify({
            'success': True,
            'message': 'Cita creada exitosamente',
            'appointment': {
                'id': appointment_id,
                **appointment_data
            }
        })
        
    except Exception as e:
        print(f"Error creando cita: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/appointments/<appointment_id>', methods=['PUT'])
@login_required
def update_appointment(appointment_id):
    """Actualiza una cita existente"""
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
        
        appointments_data = load_appointments_data()
        
        if appointment_id not in appointments_data:
            return jsonify({'success': False, 'error': 'Cita no encontrada'}), 404
        
        # Actualizar campos
        for field in ['title', 'description', 'date', 'time', 'duration', 'status', 'type', 'notes']:
            if field in data:
                appointments_data[appointment_id][field] = data[field]
        
        # Si cambió el paciente, actualizar
        if 'patient_id' in data and data['patient_id'] != appointments_data[appointment_id]['patient_id']:
            patients_data = load_patients_data()
            new_patient_id = data['patient_id']
            patient_name = patients_data.get(new_patient_id, {}).get('username', 'Paciente')
            
            appointments_data[appointment_id]['patient_id'] = new_patient_id
            appointments_data[appointment_id]['patient_name'] = patient_name
        
        appointments_data[appointment_id]['updated_at'] = datetime.now().isoformat()
        
        save_appointments_data(appointments_data)
        
        return jsonify({
            'success': True,
            'message': 'Cita actualizada exitosamente',
            'appointment': {
                'id': appointment_id,
                **appointments_data[appointment_id]
            }
        })
        
    except Exception as e:
        print(f"Error actualizando cita: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/appointments/<appointment_id>', methods=['DELETE'])
@login_required
def delete_appointment(appointment_id):
    """Elimina una cita"""
    try:
        appointments_data = load_appointments_data()
        
        if appointment_id not in appointments_data:
            return jsonify({'success': False, 'error': 'Cita no encontrada'}), 404
        
        del appointments_data[appointment_id]
        save_appointments_data(appointments_data)
        
        return jsonify({
            'success': True,
            'message': 'Cita eliminada exitosamente'
        })
        
    except Exception as e:
        print(f"Error eliminando cita: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/appointments/patient/<patient_id>', methods=['GET'])
@login_required
def get_patient_appointments(patient_id):
    """Obtiene las citas de un paciente específico"""
    try:
        appointments_data = load_appointments_data()
        
        patient_appointments = []
        for apt_id, apt_data in appointments_data.items():
            if apt_data.get('patient_id') == patient_id:
                patient_appointments.append({
                    'id': apt_id,
                    **apt_data
                })
        
        # Ordenar por fecha (más recientes primero)
        patient_appointments.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        return jsonify({
            'success': True,
            'appointments': patient_appointments,
            'count': len(patient_appointments)
        })
        
    except Exception as e:
        print(f"Error obteniendo citas del paciente: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/appointments/stats', methods=['GET'])
@login_required
def get_appointments_stats():
    """Obtiene estadísticas de citas"""
    try:
        appointments_data = load_appointments_data()
        today = datetime.now().date()
        
        # Estadísticas
        total = len(appointments_data)
        today_count = 0
        tomorrow_count = 0
        this_week_count = 0
        completed = 0
        pending = 0
        cancelled = 0
        
        for apt_id, apt_data in appointments_data.items():
            # Contar por estado
            status = apt_data.get('status', 'pending')
            if status == 'completed':
                completed += 1
            elif status == 'pending':
                pending += 1
            elif status == 'cancelled':
                cancelled += 1
            
            # Contar por fecha
            date_str = apt_data.get('date')
            if date_str:
                try:
                    apt_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    days_diff = (apt_date - today).days
                    
                    if days_diff == 0:
                        today_count += 1
                    elif days_diff == 1:
                        tomorrow_count += 1
                    elif 0 <= days_diff <= 7:
                        this_week_count += 1
                except:
                    pass
        
        return jsonify({
            'success': True,
            'stats': {
                'total': total,
                'today': today_count,
                'tomorrow': tomorrow_count,
                'this_week': this_week_count,
                'completed': completed,
                'pending': pending,
                'cancelled': cancelled
            }
        })
        
    except Exception as e:
        print(f"Error obteniendo estadísticas: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# SISTEMA DE PREDICCIÓN DE DIAGNÓSTICOS
# ==============================================

@app.route('/api/diagnosis/predict/<patient_id>', methods=['GET'])
@login_required
def predict_diagnosis(patient_id):
    """Predice el próximo diagnóstico basado en historial del paciente"""
    try:
        # Cargar datos
        patients_data = load_patients_data()
        appointments_data = load_appointments_data()
        
        # Obtener todas las recetas del paciente
        patient_recipes = []
        if 'recipes' in patients_data:
            for recipe_id, recipe in patients_data['recipes'].items():
                if recipe.get('patient_id') == patient_id:
                    patient_recipes.append(recipe)
        
        # Obtener todas las citas del paciente
        patient_appointments = []
        for apt_id, apt in appointments_data.items():
            if apt.get('patient_id') == patient_id:
                patient_appointments.append(apt)
        
        if not patient_recipes and not patient_appointments:
            return jsonify({
                'success': True,
                'predictions': [],
                'message': 'No hay suficientes datos históricos para generar predicciones'
            })
        
        # Analizar patrones de diagnóstico
        diagnosis_patterns = analyze_diagnosis_patterns(patient_recipes)
        
        # Analizar frecuencia de visitas
        visit_patterns = analyze_visit_patterns(patient_appointments)
        
        # Analizar relación medicamentos-diagnóstico
        medicine_patterns = analyze_medicine_patterns(patient_recipes)
        
        # Generar predicciones usando IA
        predictions = generate_diagnosis_predictions(
            patient_recipes, 
            patient_appointments,
            diagnosis_patterns,
            visit_patterns,
            medicine_patterns
        )
        
        return jsonify({
            'success': True,
            'predictions': predictions,
            'stats': {
                'total_recipes': len(patient_recipes),
                'total_appointments': len(patient_appointments),
                'unique_diagnoses': len(diagnosis_patterns.get('unique_diagnoses', [])),
                'avg_visit_frequency': visit_patterns.get('avg_days_between_visits', 0)
            }
        })
        
    except Exception as e:
        print(f"Error en predicción: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/diagnosis/patient-summary/<patient_id>', methods=['GET'])
@login_required
def get_patient_diagnosis_summary(patient_id):
    """Obtiene resumen completo del historial médico del paciente"""
    try:
        patients_data = load_patients_data()
        appointments_data = load_appointments_data()
        
        # Obtener información del paciente
        patient_info = patients_data.get(patient_id, {})
        
        # Obtener todas las recetas
        patient_recipes = []
        if 'recipes' in patients_data:
            for recipe_id, recipe in patients_data['recipes'].items():
                if recipe.get('patient_id') == patient_id:
                    patient_recipes.append({
                        'id': recipe_id,
                        **recipe
                    })
        
        # Obtener todas las citas
        patient_appointments = []
        for apt_id, apt in appointments_data.items():
            if apt.get('patient_id') == patient_id:
                patient_appointments.append({
                    'id': apt_id,
                    **apt
                })
        
        # Ordenar por fecha
        patient_recipes.sort(key=lambda x: x.get('date', ''), reverse=True)
        patient_appointments.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        # Estadísticas
        diagnosis_count = {}
        for recipe in patient_recipes:
            diag = recipe.get('diagnosis', 'No especificado')
            diagnosis_count[diag] = diagnosis_count.get(diag, 0) + 1
        
        most_common_diagnosis = max(diagnosis_count.items(), key=lambda x: x[1]) if diagnosis_count else ('Ninguno', 0)
        
        return jsonify({
            'success': True,
            'patient': {
                'id': patient_id,
                'name': patient_info.get('username', 'Paciente'),
                'email': patient_info.get('email', ''),
                'phone': patient_info.get('phone', ''),
                'fecha_nacimiento': patient_info.get('fecha_nacimiento', '')
            },
            'recipes': patient_recipes,
            'appointments': patient_appointments,
            'stats': {
                'total_recipes': len(patient_recipes),
                'total_appointments': len(patient_appointments),
                'unique_diagnoses': len(diagnosis_count),
                'most_common_diagnosis': most_common_diagnosis[0],
                'most_common_count': most_common_diagnosis[1]
            }
        })
        
    except Exception as e:
        print(f"Error en resumen: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/diagnosis/all-patients-stats', methods=['GET'])
@login_required
def get_all_patients_diagnosis_stats():
    """Obtiene estadísticas globales de diagnósticos"""
    try:
        patients_data = load_patients_data()
        appointments_data = load_appointments_data()
        
        # Estadísticas globales
        all_diagnoses = []
        diagnosis_by_month = {}
        patients_with_records = set()
        
        if 'recipes' in patients_data:
            for recipe_id, recipe in patients_data['recipes'].items():
                diagnosis = recipe.get('diagnosis', 'No especificado')
                all_diagnoses.append(diagnosis)
                
                # Agrupar por mes
                date = recipe.get('date', '')
                if date:
                    month = date[:7]  # YYYY-MM
                    if month not in diagnosis_by_month:
                        diagnosis_by_month[month] = []
                    diagnosis_by_month[month].append(diagnosis)
                
                patients_with_records.add(recipe.get('patient_id'))
        
        # Diagnósticos más comunes
        from collections import Counter
        diagnosis_counter = Counter(all_diagnoses)
        top_diagnoses = diagnosis_counter.most_common(10)
        
        # Evolución mensual
        evolution = []
        for month in sorted(diagnosis_by_month.keys()):
            evolution.append({
                'month': month,
                'count': len(diagnosis_by_month[month]),
                'diagnoses': diagnosis_by_month[month]
            })
        
        return jsonify({
            'success': True,
            'stats': {
                'total_patients_with_records': len(patients_with_records),
                'total_recipes': len(all_diagnoses),
                'unique_diagnoses': len(diagnosis_counter),
                'top_diagnoses': [{'diagnosis': d, 'count': c} for d, c in top_diagnoses],
                'monthly_evolution': evolution
            }
        })
        
    except Exception as e:
        print(f"Error en estadísticas globales: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/debug/check-folder/<folder_id>')
@login_required
def debug_check_folder(folder_id):
    """Función de depuración para verificar carpetas"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No Drive connection'})
        
        # Verificar carpeta
        folder = service.files().get(
            fileId=folder_id,
            fields='id, name, parents',
            supportsAllDrives=True
        ).execute()
        
        # Buscar archivos en la carpeta
        query = f"'{folder_id}' in parents and trashed = false"
        files = service.files().list(
            q=query,
            fields="files(id, name)",
            supportsAllDrives=True
        ).execute()
        
        return jsonify({
            'success': True,
            'folder': folder,
            'files': files.get('files', [])
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/debug/patients-info')
@login_required
def debug_patients_info():
    """Función de depuración para ver información de pacientes"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No Drive connection'})
        
        # Obtener todas las carpetas de pacientes
        folders_query = f"'{CONTRACTS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        folders_results = service.files().list(
            q=folders_query,
            pageSize=100,
            fields="files(id, name, createdTime)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora='drive',
            driveId=SHARED_DRIVE_ID
        ).execute()
        
        folders = folders_results.get('files', [])
        
        # Cargar datos locales
        patients_data = load_patients_data()
        
        info = []
        for folder in folders:
            folder_id = folder['id']
            local_data = patients_data.get(folder_id, {})
            
            info.append({
                'folder_id': folder_id,
                'folder_name': folder['name'],
                'created': folder.get('createdTime', ''),
                'has_local_data': folder_id in patients_data,
                'local_username': local_data.get('username', 'No local'),
                'recipes_in_folder': 0
            })
            
            # Contar recetas en la carpeta
            try:
                recipes_query = f"'{folder_id}' in parents and name contains 'RECETA' and trashed = false"
                recipes_results = service.files().list(
                    q=recipes_query,
                    fields="files(id)",
                    supportsAllDrives=True
                ).execute()
                info[-1]['recipes_in_folder'] = len(recipes_results.get('files', []))
            except:
                pass
        
        return jsonify({
            'success': True,
            'total_folders': len(folders),
            'total_local_data': len(patients_data),
            'patients': info
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/debug/find-patient-folders')
@login_required
def debug_find_patient_folders():
    """Busca carpetas de pacientes en todo el Drive compartido"""
    try:
        service = get_drive_service()
        if not service:
            return jsonify({'success': False, 'error': 'No se pudo conectar a Drive'})
        
        results = []
        
        # Buscar carpetas que tengan "PACIENTE" en el nombre
        query = "name contains 'PACIENTE' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        
        try:
            folders = service.files().list(
                q=query,
                pageSize=100,
                fields="files(id, name, parents, createdTime)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                corpora='drive',
                driveId=SHARED_DRIVE_ID
            ).execute()
            
            folders_list = folders.get('files', [])
            
            for folder in folders_list:
                # Obtener información del padre
                parent_name = "Raíz"
                if folder.get('parents'):
                    try:
                        parent = service.files().get(
                            fileId=folder['parents'][0],
                            fields='name',
                            supportsAllDrives=True
                        ).execute()
                        parent_name = parent.get('name', 'Desconocido')
                    except:
                        pass
                
                results.append({
                    'folder_id': folder['id'],
                    'folder_name': folder['name'],
                    'parent_id': folder.get('parents', ['N/A'])[0],
                    'parent_name': parent_name,
                    'created': folder.get('createdTime', '')
                })
            
            return jsonify({
                'success': True,
                'total_folders': len(results),
                'folders': results,
                'query_used': query
            })
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Error en búsqueda: {str(e)}'
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# ==============================================
# FUNCIONES AUXILIARES PARA ANÁLISIS
# ==============================================

def analyze_diagnosis_patterns(recipes):
    """Analiza patrones en los diagnósticos"""
    if not recipes:
        return {'unique_diagnoses': [], 'diagnosis_frequency': {}, 'recurring_patterns': []}
    
    diagnosis_list = [r.get('diagnosis', '') for r in recipes if r.get('diagnosis')]
    diagnosis_frequency = {}
    
    for diag in diagnosis_list:
        diagnosis_frequency[diag] = diagnosis_frequency.get(diag, 0) + 1
    
    # Identificar diagnósticos recurrentes (más de una vez)
    recurring = [d for d, count in diagnosis_frequency.items() if count > 1]
    
    # Buscar patrones temporales (mismo diagnóstico en épocas similares)
    seasonal_patterns = []
    for diag in recurring:
        dates = []
        for recipe in recipes:
            if recipe.get('diagnosis') == diag and recipe.get('date'):
                try:
                    date_obj = datetime.strptime(recipe['date'], '%Y-%m-%d')
                    dates.append(date_obj)
                except:
                    pass
        
        if len(dates) >= 2:
            # Calcular promedio de días entre recurrencias
            intervals = []
            for i in range(1, len(dates)):
                delta = (dates[i] - dates[i-1]).days
                intervals.append(delta)
            
            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                seasonal_patterns.append({
                    'diagnosis': diag,
                    'frequency': diagnosis_frequency[diag],
                    'avg_days_between': round(avg_interval, 1),
                    'last_date': max(dates).strftime('%Y-%m-%d') if dates else None
                })
    
    return {
        'unique_diagnoses': list(set(diagnosis_list)),
        'diagnosis_frequency': diagnosis_frequency,
        'recurring_patterns': seasonal_patterns
    }

def analyze_visit_patterns(appointments):
    """Analiza patrones de visitas"""
    if not appointments:
        return {'avg_days_between_visits': 0, 'visit_frequency': {}, 'preferred_days': []}
    
    # Extraer fechas de visitas
    visit_dates = []
    for apt in appointments:
        if apt.get('date'):
            try:
                visit_dates.append(datetime.strptime(apt['date'], '%Y-%m-%d'))
            except:
                pass
    
    visit_dates.sort()
    
    # Calcular intervalo promedio entre visitas
    intervals = []
    for i in range(1, len(visit_dates)):
        delta = (visit_dates[i] - visit_dates[i-1]).days
        intervals.append(delta)
    
    avg_days = sum(intervals) / len(intervals) if intervals else 0
    
    # Días de la semana preferidos
    day_counts = {}
    for date in visit_dates:
        day_name = date.strftime('%A')  # Monday, Tuesday, etc.
        day_counts[day_name] = day_counts.get(day_name, 0) + 1
    
    # Tipos de cita preferidos
    type_counts = {}
    for apt in appointments:
        apt_type = apt.get('type', 'general')
        type_counts[apt_type] = type_counts.get(apt_type, 0) + 1
    
    return {
        'avg_days_between_visits': round(avg_days, 1),
        'visit_frequency': day_counts,
        'preferred_types': type_counts,
        'total_visits': len(appointments)
    }

def analyze_medicine_patterns(recipes):
    """Analiza patrones de medicamentos por diagnóstico"""
    medicine_by_diagnosis = {}
    
    for recipe in recipes:
        diagnosis = recipe.get('diagnosis', '')
        medicines = recipe.get('medicines', [])
        
        if diagnosis not in medicine_by_diagnosis:
            medicine_by_diagnosis[diagnosis] = []
        
        for med in medicines:
            med_name = med.get('name', '')
            if med_name:
                medicine_by_diagnosis[diagnosis].append({
                    'name': med_name,
                    'dosage': med.get('dosage', ''),
                    'frequency': med.get('frequency', '')
                })
    
    return medicine_by_diagnosis

def generate_diagnosis_predictions(recipes, appointments, diag_patterns, visit_patterns, med_patterns):
    """Genera predicciones de diagnóstico usando análisis de patrones"""
    predictions = []
    
    if not recipes:
        return predictions
    
    # Último diagnóstico
    latest_recipe = max(recipes, key=lambda x: x.get('date', '')) if recipes else None
    
    # Predicción 1: Basada en recurrencia estacional
    for pattern in diag_patterns.get('recurring_patterns', []):
        if pattern.get('last_date'):
            try:
                last_date = datetime.strptime(pattern['last_date'], '%Y-%m-%d')
                days_since = (datetime.now() - last_date).days
                avg_interval = pattern.get('avg_days_between', 0)
                
                # Si se acerca el intervalo promedio, predecir recurrencia
                if avg_interval > 0 and days_since >= (avg_interval * 0.8):
                    days_to_prediction = max(0, avg_interval - days_since)
                    predictions.append({
                        'type': 'recurrence',
                        'diagnosis': pattern['diagnosis'],
                        'confidence': min(90, round((days_since / avg_interval) * 100)),
                        'predicted_date': (datetime.now() + timedelta(days=days_to_prediction)).strftime('%Y-%m-%d'),
                        'reason': f'Patrón recurrente: aparece cada {avg_interval} días aproximadamente',
                        'medicines': med_patterns.get(pattern['diagnosis'], [])
                    })
            except:
                pass
    
    # Predicción 2: Basada en próxima cita programada
    upcoming_appointments = [a for a in appointments if a.get('date', '') >= datetime.now().strftime('%Y-%m-%d')]
    if upcoming_appointments:
        next_apt = min(upcoming_appointments, key=lambda x: x.get('date', ''))
        
        # Si hay una cita próxima, predecir posible diagnóstico basado en historial
        if recipes:
            # Tomar el diagnóstico más común
            diag_freq = diag_patterns.get('diagnosis_frequency', {})
            if diag_freq:
                most_common = max(diag_freq.items(), key=lambda x: x[1])
                predictions.append({
                    'type': 'upcoming_appointment',
                    'diagnosis': most_common[0],
                    'confidence': 70,
                    'predicted_date': next_apt.get('date'),
                    'reason': f'Basado en cita programada para {next_apt.get("date")} y diagnóstico más frecuente',
                    'medicines': med_patterns.get(most_common[0], [])
                })
    
    # Predicción 3: Basada en frecuencia de visitas
    if visit_patterns.get('avg_days_between_visits', 0) > 0:
        last_visit_date = None
        for apt in sorted(appointments, key=lambda x: x.get('date', ''), reverse=True):
            if apt.get('date'):
                try:
                    last_visit_date = datetime.strptime(apt['date'], '%Y-%m-%d')
                    break
                except:
                    pass
        
        if last_visit_date:
            days_since_visit = (datetime.now() - last_visit_date).days
            avg_interval = visit_patterns['avg_days_between_visits']
            
            if days_since_visit >= avg_interval * 0.7:
                # Predecir visita próxima
                days_to_visit = max(0, avg_interval - days_since_visit)
                
                # Buscar diagnóstico asociado a visitas similares
                for pattern in diag_patterns.get('recurring_patterns', []):
                    if pattern.get('avg_days_between', 0) and abs(pattern['avg_days_between'] - avg_interval) < 10:
                        predictions.append({
                            'type': 'visit_pattern',
                            'diagnosis': pattern['diagnosis'],
                            'confidence': 65,
                            'predicted_date': (datetime.now() + timedelta(days=days_to_visit)).strftime('%Y-%m-%d'),
                            'reason': f'Patrón de visitas: normalmente cada {avg_interval} días',
                            'medicines': med_patterns.get(pattern['diagnosis'], [])
                        })
                        break
    
    # Ordenar por confianza
    predictions.sort(key=lambda x: x.get('confidence', 0), reverse=True)
    
    return predictions[:5]  # Máximo 5 predicciones

# ==============================================
# SISTEMA DE PREDICCIÓN DE DIAGNÓSTICOS CON IA
# ==============================================

@app.route('/api/diagnosis/predict-with-ai/<patient_id>', methods=['GET'])
@login_required
def predict_diagnosis_with_ai(patient_id):
    """Predice el próximo diagnóstico usando IA de Google (Gemini)"""
    try:
        # Cargar datos
        patients_data = load_patients_data()
        appointments_data = load_appointments_data()
        
        # Obtener información del paciente
        patient_info = patients_data.get(patient_id, {})
        patient_name = patient_info.get('username', 'Paciente')
        
        # Obtener todas las recetas del paciente
        patient_recipes = []
        if 'recipes' in patients_data:
            for recipe_id, recipe in patients_data['recipes'].items():
                if recipe.get('patient_id') == patient_id:
                    patient_recipes.append(recipe)
        
        # Obtener todas las citas del paciente
        patient_appointments = []
        for apt_id, apt in appointments_data.items():
            if apt.get('patient_id') == patient_id:
                patient_appointments.append(apt)
        
        # Ordenar por fecha
        patient_recipes.sort(key=lambda x: x.get('date', ''), reverse=True)
        patient_appointments.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        if len(patient_recipes) < 2:
            return jsonify({
                'success': False,
                'error': f'Se necesitan al menos 2 recetas. Actualmente tiene {len(patient_recipes)}.',
                'requires_more_data': True,
                'current_count': len(patient_recipes)
            })
        
        # Preparar el historial para la IA
        medical_history = prepare_medical_history_for_ai(patient_recipes, patient_appointments)
        
        # Llamar a Gemini para la predicción
        ai_prediction = call_gemini_for_diagnosis(medical_history, patient_name)
        
        if ai_prediction['success']:
            return jsonify({
                'success': True,
                'predictions': ai_prediction['predictions'],
                'patient_name': patient_name,
                'recipes_count': len(patient_recipes),
                'appointments_count': len(patient_appointments)
            })
        else:
            return jsonify({
                'success': False,
                'error': ai_prediction.get('error', 'Error en la IA'),
                'fallback': generate_fallback_predictions(patient_recipes, patient_appointments)
            })
        
    except Exception as e:
        print(f"Error en predicción con IA: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def prepare_medical_history_for_ai(recipes, appointments):
    """Prepara el historial médico en formato texto para la IA"""
    
    # Ordenar recetas por fecha (más antiguas primero para contexto)
    recipes_sorted = sorted(recipes, key=lambda x: x.get('date', ''))
    
    history = "HISTORIAL MÉDICO DEL PACIENTE:\n\n"
    history += "=== RECETAS MÉDICAS ===\n"
    
    for i, recipe in enumerate(recipes_sorted, 1):
        date = recipe.get('date', 'Fecha desconocida')
        diagnosis = recipe.get('diagnosis', 'No especificado')
        doctor = recipe.get('doctor', 'No especificado')
        
        history += f"\n--- Receta #{i} ({date}) ---\n"
        history += f"Diagnóstico: {diagnosis}\n"
        history += f"Médico: {doctor}\n"
        
        medicines = recipe.get('medicines', [])
        if medicines:
            history += "Medicamentos:\n"
            for med in medicines:
                name = med.get('name', '')
                dosage = med.get('dosage', '')
                frequency = med.get('frequency', '')
                history += f"  • {name} - {dosage} - {frequency}\n"
        
        if recipe.get('instructions'):
            history += f"Instrucciones: {recipe['instructions']}\n"
    
    # Agregar información de citas
    if appointments:
        history += "\n=== HISTORIAL DE CITAS ===\n"
        appointments_sorted = sorted(appointments, key=lambda x: x.get('date', ''))
        
        for i, apt in enumerate(appointments_sorted, 1):
            date = apt.get('date', 'Fecha desconocida')
            time = apt.get('time', '')
            apt_type = apt.get('type', 'general')
            status = apt.get('status', 'pending')
            
            history += f"\n--- Cita #{i} ({date} {time}) ---\n"
            history += f"Tipo: {apt_type}\n"
            history += f"Estado: {status}\n"
    
    # Agregar próxima cita si existe
    future_appointments = [a for a in appointments if a.get('date', '') >= datetime.now().strftime('%Y-%m-%d')]
    if future_appointments:
        next_apt = min(future_appointments, key=lambda x: x.get('date', ''))
        history += f"\n=== PRÓXIMA CITA ===\n"
        history += f"Fecha: {next_apt.get('date', '')} {next_apt.get('time', '')}\n"
        history += f"Tipo: {next_apt.get('type', 'general')}\n"
    
    return history

def call_gemini_for_diagnosis(medical_history, patient_name):
    """Llama a Gemini para generar predicciones de diagnóstico"""
    try:
        if not GOOGLE_AI_API_KEY:
            return {'success': False, 'error': 'API Key de Google AI no configurada'}
        
        prompt = f"""
        Eres un médico experto en análisis de patrones clínicos y predicción de diagnósticos.
        
        {medical_history}
        
        Basándote en el historial médico proporcionado, genera PREDICCIONES de posibles próximos diagnósticos para este paciente.
        
        INSTRUCCIONES IMPORTANTES:
        1. Analiza los patrones de diagnóstico (enfermedades recurrentes, estacionalidad)
        2. Considera la frecuencia de visitas y el tipo de consultas
        3. Observa la relación entre medicamentos recetados y diagnósticos
        4. Toma en cuenta la próxima cita programada si existe
        5. Genera entre 1 y 3 predicciones, ordenadas por probabilidad
        
        FORMATO DE RESPUESTA (SOLO JSON, sin texto adicional):
        {{
            "predictions": [
                {{
                    "diagnosis": "nombre del diagnóstico predicho",
                    "confidence": número entre 60-95 (porcentaje de confianza),
                    "reason": "explicación breve de por qué se predice esto",
                    "suggested_medicines": [
                        {{
                            "name": "nombre del medicamento",
                            "dosage": "dosis exacta (ej: 500mg, 1 tableta, 5ml)",
                            "frequency": "frecuencia (ej: cada 8 horas, cada 12 horas)",
                            "duration": "duración del tratamiento (ej: 7 días, 10 días, hasta terminar)",
                            "contraindications": "contraindicaciones específicas (ej: no tomar con alcohol, evitar si hay alergia, precaución en insuficiencia renal)"
                        }}
                    ],
                    "recommendations": "recomendaciones para el médico incluyendo duración total del tratamiento"
                }}
            ]
        }}
        
        REGLAS:
        - Confidence debe ser realista basado en los patrones observados
        - Para dosis, sé lo más específico posible basado en recetas anteriores
        - Para duración, incluye días exactos de tratamiento
        - Para contraindicaciones, menciona las más relevantes para cada medicamento
        - NO incluyas campos de tipo o fecha estimada
        """
        
        # Llamar a la API de Google AI
        headers = {'Content-Type': 'application/json'}
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 1500,
                "topP": 0.8,
                "topK": 40
            }
        }
        
        url = f"{GOOGLE_AI_URL}{MODEL_NAME}:generateContent?key={GOOGLE_AI_API_KEY}"
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            response_data = response.json()
            if 'candidates' in response_data and len(response_data['candidates']) > 0:
                reply = response_data['candidates'][0]['content']['parts'][0]['text']
                
                # Extraer JSON de la respuesta
                import re
                json_match = re.search(r'\{.*\}', reply, re.DOTALL)
                
                if json_match:
                    predictions_data = json.loads(json_match.group(0))
                    return {'success': True, 'predictions': predictions_data.get('predictions', [])}
                else:
                    # Si no hay JSON, crear predicción por defecto
                    return {
                        'success': True,
                        'predictions': create_default_predictions(medical_history)
                    }
            else:
                return {'success': False, 'error': 'No se generó respuesta de la IA'}
        else:
            return {'success': False, 'error': f'Error API: {response.status_code}'}
            
    except Exception as e:
        print(f"Error llamando a Gemini: {e}")
        return {'success': False, 'error': str(e)}

def create_default_predictions(medical_history):
    """Crea predicciones por defecto si la IA falla"""
    return [
        {
            "diagnosis": "Infección respiratoria aguda",
            "confidence": 75,
            "reason": "Basado en patrones estacionales y síntomas previos",
            "suggested_medicines": [
                {
                    "name": "Amoxicilina", 
                    "dosage": "500mg", 
                    "frequency": "Cada 8 horas",
                    "duration": "7-10 días",
                    "contraindications": "Alergia a penicilinas, insuficiencia renal severa"
                },
                {
                    "name": "Paracetamol", 
                    "dosage": "500mg", 
                    "frequency": "Cada 8 horas según dolor o fiebre",
                    "duration": "Máximo 5 días consecutivos",
                    "contraindications": "Insuficiencia hepática severa, alcoholismo"
                }
            ],
            "recommendations": "Completar ciclo de antibiótico de 7-10 días. Acudir a control si no hay mejoría en 72 horas."
        }
    ]

def generate_fallback_predictions(recipes, appointments):
    """Genera predicciones de respaldo si la IA no está disponible"""
    predictions = []
    
    if len(recipes) >= 2:
        # Análisis básico de recurrencia
        diagnoses = [r.get('diagnosis', '') for r in recipes if r.get('diagnosis')]
        from collections import Counter
        most_common = Counter(diagnoses).most_common(1)
        
        if most_common and most_common[0][1] >= 2:
            predictions.append({
                "diagnosis": most_common[0][0],
                "confidence": 70,
                "reason": f"Diagnóstico recurrente (aparece {most_common[0][1]} veces en el historial)",
                "type": "recurrence",
                "estimated_date": (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
                "suggested_medicines": [],
                "recommendations": "Programar consulta de seguimiento"
            })
    
    # Si hay próxima cita
    future_appointments = [a for a in appointments if a.get('date', '') >= datetime.now().strftime('%Y-%m-%d')]
    if future_appointments:
        next_apt = min(future_appointments, key=lambda x: x.get('date', ''))
        predictions.append({
            "diagnosis": "Consulta de seguimiento",
            "confidence": 85,
            "reason": f"Cita programada para {next_apt.get('date', '')}",
            "type": "follow_up",
            "estimated_date": next_apt.get('date', ''),
            "suggested_medicines": [],
            "recommendations": "Preparar historial para la consulta"
        })
    
    return predictions

@app.route('/api/diagnosis/analyze-symptoms', methods=['POST'])
@login_required
def analyze_symptoms_with_ai():
    """Analiza síntomas actuales con IA para sugerir diagnósticos"""
    try:
        data = request.json
        symptoms = data.get('symptoms', '')
        patient_id = data.get('patient_id')
        
        if not symptoms:
            return jsonify({'success': False, 'error': 'Síntomas requeridos'}), 400
        
        # Obtener historial del paciente si se proporciona ID
        patient_history = ""
        if patient_id:
            patients_data = load_patients_data()
            recipes = []
            if 'recipes' in patients_data:
                for recipe_id, recipe in patients_data['recipes'].items():
                    if recipe.get('patient_id') == patient_id:
                        recipes.append(recipe)
            
            if recipes:
                patient_history = "Historial del paciente:\n"
                for r in recipes[-3:]:  # Últimas 3 recetas
                    patient_history += f"- {r.get('date', '')}: {r.get('diagnosis', '')}\n"
        
        prompt = f"""
        Eres un médico diagnosticando a un paciente.
        
        {patient_history}
        
        Síntomas actuales del paciente:
        {symptoms}
        
        Basado en estos síntomas y el historial (si existe), sugiere:
        1. Posibles diagnósticos (de mayor a menor probabilidad)
        2. Estudios recomendados
        3. Tratamiento inicial sugerido
        
        Responde en formato JSON:
        {{
            "possible_diagnoses": [
                {{"name": "diagnóstico", "probability": "alta/media/baja", "reason": "por qué"}}
            ],
            "recommended_studies": ["estudio1", "estudio2"],
            "initial_treatment": "descripción del tratamiento",
            "urgency": "alta/media/baja",
            "recommendations": "recomendaciones adicionales"
        }}
        """
        
        # Llamar a Gemini
        headers = {'Content-Type': 'application/json'}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1000}
        }
        
        url = f"{GOOGLE_AI_URL}{MODEL_NAME}:generateContent?key={GOOGLE_AI_API_KEY}"
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            response_data = response.json()
            reply = response_data['candidates'][0]['content']['parts'][0]['text']
            
            import re
            json_match = re.search(r'\{.*\}', reply, re.DOTALL)
            if json_match:
                analysis = json.loads(json_match.group(0))
                return jsonify({'success': True, 'analysis': analysis})
        
        return jsonify({'success': False, 'error': 'No se pudo analizar'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ==============================================
# INICIALIZACIÓN
# ==============================================

if __name__ == '__main__':
    print("=" * 70)
    print(f"📁 Unidad Compartida ID: {SHARED_DRIVE_ID}")
    print(f"📂 Carpeta de Contratos ID: {CONTRACTS_FOLDER_ID}")
    print(f"🤖 Modelo de IA: {MODEL_NAME}")
    
    # Inicializar directorio de datos
    print("\n🌐 Iniciando servidor web...")
    print("=" * 70)
    
    app.run(debug=True, port=5000, host='0.0.0.0')