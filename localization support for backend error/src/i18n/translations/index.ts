import { SupportedLanguage } from "../i18n.service";

type TranslationDictionary = Record<string, string>;

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    // Authentication & Authorization
    "error.unauthorized": "Unauthorized access",
    "error.forbidden": "You do not have permission to access this resource",
    "error.invalid_credentials": "Invalid email or password",
    "error.token_expired": "Your session has expired. Please login again",
    "error.invalid_token": "Invalid authentication token",

    // Validation
    "error.validation_failed": "Validation failed",
    "error.required_field": "{field} is required",
    "error.invalid_email": "Invalid email format",
    "error.invalid_format": "Invalid {field} format",
    "error.min_length": "{field} must be at least {min} characters",
    "error.max_length": "{field} must not exceed {max} characters",

    // Resource Errors
    "error.not_found": "{resource} not found",
    "error.already_exists": "{resource} already exists",
    "error.conflict": "Resource conflict occurred",

    // Database Errors
    "error.database": "Database error occurred",
    "error.duplicate_entry": "Duplicate entry for {field}",

    // General Errors
    "error.internal_server": "Internal server error",
    "error.bad_request": "Bad request",
    "error.service_unavailable": "Service temporarily unavailable",
    "error.rate_limit": "Too many requests. Please try again later",
  },

  es: {
    "error.unauthorized": "Acceso no autorizado",
    "error.forbidden": "No tienes permiso para acceder a este recurso",
    "error.invalid_credentials": "Email o contraseña inválidos",
    "error.token_expired":
      "Tu sesión ha expirado. Por favor inicia sesión nuevamente",
    "error.invalid_token": "Token de autenticación inválido",

    "error.validation_failed": "Validación fallida",
    "error.required_field": "{field} es requerido",
    "error.invalid_email": "Formato de email inválido",
    "error.invalid_format": "Formato de {field} inválido",
    "error.min_length": "{field} debe tener al menos {min} caracteres",
    "error.max_length": "{field} no debe exceder {max} caracteres",

    "error.not_found": "{resource} no encontrado",
    "error.already_exists": "{resource} ya existe",
    "error.conflict": "Conflicto de recurso",

    "error.database": "Error de base de datos",
    "error.duplicate_entry": "Entrada duplicada para {field}",

    "error.internal_server": "Error interno del servidor",
    "error.bad_request": "Solicitud incorrecta",
    "error.service_unavailable": "Servicio temporalmente no disponible",
    "error.rate_limit": "Demasiadas solicitudes. Por favor intenta más tarde",
  },

  fr: {
    "error.unauthorized": "Accès non autorisé",
    "error.forbidden":
      "Vous n'avez pas la permission d'accéder à cette ressource",
    "error.invalid_credentials": "Email ou mot de passe invalide",
    "error.token_expired": "Votre session a expiré. Veuillez vous reconnecter",
    "error.invalid_token": "Token d'authentification invalide",

    "error.validation_failed": "La validation a échoué",
    "error.required_field": "{field} est requis",
    "error.invalid_email": "Format email invalide",
    "error.invalid_format": "Format {field} invalide",
    "error.min_length": "{field} doit contenir au moins {min} caractères",
    "error.max_length": "{field} ne doit pas dépasser {max} caractères",

    "error.not_found": "{resource} non trouvé",
    "error.already_exists": "{resource} existe déjà",
    "error.conflict": "Conflit de ressource",

    "error.database": "Erreur de base de données",
    "error.duplicate_entry": "Entrée en double pour {field}",

    "error.internal_server": "Erreur interne du serveur",
    "error.bad_request": "Requête incorrecte",
    "error.service_unavailable": "Service temporairement indisponible",
    "error.rate_limit": "Trop de requêtes. Veuillez réessayer plus tard",
  },

  de: {
    "error.unauthorized": "Unbefugter Zugriff",
    "error.forbidden": "Sie haben keine Berechtigung für diese Ressource",
    "error.invalid_credentials": "Ungültige E-Mail oder Passwort",
    "error.token_expired":
      "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an",
    "error.invalid_token": "Ungültiges Authentifizierungstoken",

    "error.validation_failed": "Validierung fehlgeschlagen",
    "error.required_field": "{field} ist erforderlich",
    "error.invalid_email": "Ungültiges E-Mail-Format",
    "error.invalid_format": "Ungültiges {field}-Format",
    "error.min_length": "{field} muss mindestens {min} Zeichen lang sein",
    "error.max_length": "{field} darf {max} Zeichen nicht überschreiten",

    "error.not_found": "{resource} nicht gefunden",
    "error.already_exists": "{resource} existiert bereits",
    "error.conflict": "Ressourcenkonflikt aufgetreten",

    "error.database": "Datenbankfehler aufgetreten",
    "error.duplicate_entry": "Doppelter Eintrag für {field}",

    "error.internal_server": "Interner Serverfehler",
    "error.bad_request": "Fehlerhafte Anfrage",
    "error.service_unavailable": "Dienst vorübergehend nicht verfügbar",
    "error.rate_limit":
      "Zu viele Anfragen. Bitte versuchen Sie es später erneut",
  },

  pt: {
    "error.unauthorized": "Acesso não autorizado",
    "error.forbidden": "Você não tem permissão para acessar este recurso",
    "error.invalid_credentials": "Email ou senha inválidos",
    "error.token_expired":
      "Sua sessão expirou. Por favor, faça login novamente",
    "error.invalid_token": "Token de autenticação inválido",

    "error.validation_failed": "Validação falhou",
    "error.required_field": "{field} é obrigatório",
    "error.invalid_email": "Formato de email inválido",
    "error.invalid_format": "Formato de {field} inválido",
    "error.min_length": "{field} deve ter pelo menos {min} caracteres",
    "error.max_length": "{field} não deve exceder {max} caracteres",

    "error.not_found": "{resource} não encontrado",
    "error.already_exists": "{resource} já existe",
    "error.conflict": "Conflito de recurso ocorreu",

    "error.database": "Erro de banco de dados",
    "error.duplicate_entry": "Entrada duplicada para {field}",

    "error.internal_server": "Erro interno do servidor",
    "error.bad_request": "Requisição inválida",
    "error.service_unavailable": "Serviço temporariamente indisponível",
    "error.rate_limit":
      "Muitas requisições. Por favor, tente novamente mais tarde",
  },

  zh: {
    "error.unauthorized": "未授权访问",
    "error.forbidden": "您没有权限访问此资源",
    "error.invalid_credentials": "邮箱或密码无效",
    "error.token_expired": "您的会话已过期,请重新登录",
    "error.invalid_token": "无效的认证令牌",

    "error.validation_failed": "验证失败",
    "error.required_field": "{field} 是必需的",
    "error.invalid_email": "邮箱格式无效",
    "error.invalid_format": "{field} 格式无效",
    "error.min_length": "{field} 必须至少 {min} 个字符",
    "error.max_length": "{field} 不得超过 {max} 个字符",

    "error.not_found": "未找到 {resource}",
    "error.already_exists": "{resource} 已存在",
    "error.conflict": "资源冲突",

    "error.database": "数据库错误",
    "error.duplicate_entry": "{field} 的重复条目",

    "error.internal_server": "内部服务器错误",
    "error.bad_request": "错误的请求",
    "error.service_unavailable": "服务暂时不可用",
    "error.rate_limit": "请求过多,请稍后再试",
  },

  ja: {
    "error.unauthorized": "不正なアクセス",
    "error.forbidden": "このリソースへのアクセス権限がありません",
    "error.invalid_credentials": "メールアドレスまたはパスワードが無効です",
    "error.token_expired":
      "セッションの有効期限が切れました。再度ログインしてください",
    "error.invalid_token": "無効な認証トークン",

    "error.validation_failed": "検証に失敗しました",
    "error.required_field": "{field} は必須です",
    "error.invalid_email": "メールアドレスの形式が無効です",
    "error.invalid_format": "{field} の形式が無効です",
    "error.min_length": "{field} は少なくとも {min} 文字必要です",
    "error.max_length": "{field} は {max} 文字を超えることはできません",

    "error.not_found": "{resource} が見つかりません",
    "error.already_exists": "{resource} は既に存在します",
    "error.conflict": "リソースの競合が発生しました",

    "error.database": "データベースエラーが発生しました",
    "error.duplicate_entry": "{field} の重複エントリ",

    "error.internal_server": "内部サーバーエラー",
    "error.bad_request": "不正なリクエスト",
    "error.service_unavailable": "サービスは一時的に利用できません",
    "error.rate_limit": "リクエストが多すぎます。後でもう一度お試しください",
  },
};
