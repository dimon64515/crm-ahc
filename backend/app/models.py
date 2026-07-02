from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, DECIMAL, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="contractor")
    full_name = Column(String(100))
    phone = Column(String(20))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    works = relationship("Work", back_populates="user")


class Building(Base):
    __tablename__ = "buildings"
    
    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(20), nullable=False, index=True)
    name = Column(String(100))
    address = Column(String(255))
    area = Column(DECIMAL(10, 2))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    works = relationship("Work", back_populates="building")


class Service(Base):
    __tablename__ = "services"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    unit = Column(String(50))
    price = Column(DECIMAL(12, 2), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    works = relationship("Work", back_populates="service")


class Material(Base):
    __tablename__ = "materials"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    unit = Column(String(50))
    price = Column(DECIMAL(12, 2), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    work_materials = relationship("WorkMaterial", back_populates="material")


class Work(Base):
    __tablename__ = "works"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    description = Column(Text)
    service_quantity = Column(DECIMAL(10, 2))
    service_unit_price = Column(DECIMAL(12, 2))
    service_total_price = Column(DECIMAL(12, 2))
    materials_total_price = Column(DECIMAL(12, 2), default=0)
    total_price = Column(DECIMAL(12, 2))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="works")
    building = relationship("Building", back_populates="works")
    service = relationship("Service", back_populates="works")
    photos = relationship("WorkPhoto", back_populates="work", cascade="all, delete-orphan")
    files = relationship("WorkFile", back_populates="work", cascade="all, delete-orphan")
    work_materials = relationship("WorkMaterial", back_populates="work", cascade="all, delete-orphan")


class WorkMaterial(Base):
    __tablename__ = "work_materials"
    
    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    quantity = Column(DECIMAL(10, 2), nullable=False)
    unit_price = Column(DECIMAL(12, 2), nullable=False)
    total_price = Column(DECIMAL(12, 2), nullable=False)
    
    work = relationship("Work", back_populates="work_materials")
    material = relationship("Material", back_populates="work_materials")
    
    __table_args__ = (
        UniqueConstraint('work_id', 'material_id', name='uix_work_material'),
    )


class WorkPhoto(Base):
    __tablename__ = "work_photos"
    
    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255))
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    work = relationship("Work", back_populates="photos")


class WorkFile(Base):
    __tablename__ = "work_files"
    
    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255))
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    work = relationship("Work", back_populates="files")


class BackupLog(Base):
    __tablename__ = "backup_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    backup_id = Column(String(100), unique=True, nullable=False)
    backup_type = Column(String(20), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    total_size_mb = Column(Integer)
    parts_count = Column(Integer, default=1)
    filters = Column(JSON)
    backup_metadata = Column(JSON)
    file_paths = Column(JSON)
    status = Column(String(20), default="completed")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="new")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date = Column(Date, nullable=False)
    extended_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    building = relationship("Building")
    creator = relationship("User", foreign_keys=[created_by])
    executor = relationship("User", foreign_keys=[assigned_to])
    photos = relationship("RequestPhoto", back_populates="request", cascade="all, delete-orphan")


class RequestPhoto(Base):
    __tablename__ = "request_photos"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255))
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)

    request = relationship("Request", back_populates="photos")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String(500), nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
