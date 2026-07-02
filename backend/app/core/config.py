from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "CRM АХЧ"
    DEBUG: bool = False
    
    DATABASE_URL: str = "postgresql://crm_user:crm_password@localhost:5432/crm_db"
    
    SECRET_KEY: str = "your-super-secret-key-change-in-production-min-32-chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    UPLOAD_DIR: str = "/var/www/crm/uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10 MB
    MAX_PHOTO_SIZE: int = 1 * 1024 * 1024  # 1 MB after compression
    MAX_PHOTOS_PER_WORK: int = 20
    
    ALLOWED_ORIGINS: str = "https://report.fanat-mv.ru,http://localhost:5173"
    
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@example.com"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
