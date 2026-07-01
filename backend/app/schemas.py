from pydantic import BaseModel, Field, validator, field_validator
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal


# === User Schemas ===

class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None


class UserCreate(UserBase):
    password: str
    role: str = "contractor"


class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenWithUser(Token):
    user: UserResponse


class LoginRequest(BaseModel):
    username: str
    password: str


# === Building Schemas ===

class BuildingBase(BaseModel):
    number: str
    name: Optional[str] = None
    address: Optional[str] = None


class BuildingCreate(BuildingBase):
    pass


class BuildingResponse(BuildingBase):
    id: int
    area: Optional[float] = None
    is_active: bool
    
    class Config:
        from_attributes = True


# === Service Schemas ===

class ServiceBase(BaseModel):
    name: str
    unit: Optional[str] = None
    price: Decimal


class ServiceCreate(ServiceBase):
    pass


class ServiceResponse(ServiceBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# === Material Schemas ===

class MaterialBase(BaseModel):
    name: str
    unit: Optional[str] = None
    price: Decimal


class MaterialCreate(MaterialBase):
    pass


class MaterialResponse(MaterialBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# === Work Schemas ===

class WorkMaterialCreate(BaseModel):
    material_id: int
    quantity: Decimal = Field(gt=0)


class WorkMaterialResponse(BaseModel):
    material_id: int
    name: str
    unit: Optional[str]
    quantity: Decimal
    unit_price: Decimal
    total_price: Decimal
    
    class Config:
        from_attributes = True


class WorkPhotoResponse(BaseModel):
    id: int
    filename: str
    original_name: Optional[str]
    url: str
    file_size: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


class WorkFileResponse(BaseModel):
    id: int
    filename: str
    original_name: Optional[str]
    url: str
    file_size: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


class WorkCreate(BaseModel):
    building_id: int
    work_date: date
    service_id: int
    service_quantity: Decimal = Field(gt=0)
    description: str = Field(min_length=5)
    materials: List[WorkMaterialCreate] = []

    @validator('work_date')
    def work_date_not_in_future(cls, v):
        if v > date.today():
            raise ValueError('Дата работы не может быть в будущем')
        return v


class WorkUpdatePrices(BaseModel):
    service_unit_price: Optional[Decimal] = None
    materials: List[dict] = []


class WorkUpdate(BaseModel):
    description: Optional[str] = None
    service_quantity: Optional[Decimal] = Field(None, gt=0)
    work_date: Optional[date] = None

    @field_validator('service_quantity', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == '' or v is None:
            return None
        return v

    @field_validator('work_date', mode='before')
    @classmethod
    def empty_str_work_date_to_none(cls, v):
        if v == '' or v is None:
            return None
        return v

    @field_validator('work_date')
    @classmethod
    def work_date_not_in_future(cls, v):
        if v is None:
            return v
        if v > date.today():
            raise ValueError('Дата работы не может быть в будущем')
        return v


class WorkUpdateAdmin(WorkUpdate):
    building_id: Optional[int] = None
    service_id: Optional[int] = None
    user_id: Optional[int] = None
    materials: Optional[List[WorkMaterialCreate]] = None


class WorkResponse(BaseModel):
    id: int
    building: BuildingResponse
    work_date: date
    service: ServiceResponse
    service_quantity: Decimal
    service_unit_price: Optional[Decimal]
    service_total_price: Optional[Decimal]
    description: str
    materials: List[WorkMaterialResponse]
    materials_total_price: Optional[Decimal]
    total_price: Optional[Decimal]
    photos: List[WorkPhotoResponse]
    files: List[WorkFileResponse]
    created_at: datetime
    created_by: UserResponse
    
    class Config:
        from_attributes = True


class WorkListItem(BaseModel):
    id: int
    building: BuildingResponse
    work_date: date
    service: ServiceResponse
    service_quantity: Decimal
    service_unit_price: Optional[Decimal]
    service_total_price: Optional[Decimal]
    description: str
    materials_total_price: Optional[Decimal]
    total_price: Optional[Decimal]
    photos_count: int
    files_count: int
    created_at: datetime
    created_by: UserResponse
    
    class Config:
        from_attributes = True


class WorkListResponse(BaseModel):
    items: List[WorkListItem]
    total: int
    page: int
    per_page: int


class WorkSummary(BaseModel):
    total_works: int
    total_service_price: Decimal
    total_materials_price: Decimal
    total_price: Decimal


# === Report Schemas ===

class SummaryReportItem(BaseModel):
    group_key: str
    group_name: str
    works_count: int
    service_total: Decimal
    materials_total: Decimal
    total: Decimal


class SummaryReportResponse(BaseModel):
    group_by: str
    items: List[SummaryReportItem]
    totals: WorkSummary


class BackupSummary(BaseModel):
    total_works: int
    total_service_price: Decimal
    total_materials_price: Decimal
    total_price: Decimal


# === Import Schemas ===

class ImportResult(BaseModel):
    total_rows: int
    created: int
    updated: int
    errors: int
    error_details: List[str] = []
    message: str


# === Backup Schemas ===

class BackupFilePart(BaseModel):
    part: int
    filename: str
    size_mb: int
    url: str


class BackupResponse(BaseModel):
    backup_id: str
    total_files: Optional[int]
    total_size_mb: int
    parts: int
    files: List[BackupFilePart]


# === Request Schemas ===

class RequestPhotoResponse(BaseModel):
    id: int
    filename: str
    original_name: Optional[str]
    url: str
    file_size: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class RequestCreate(BaseModel):
    building_id: int
    description: str = Field(min_length=5)

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Описание не может быть пустым')
        return v


class RequestAssign(BaseModel):
    user_id: int


class RequestResponse(BaseModel):
    id: int
    building: BuildingResponse
    description: str
    status: str
    creator: UserResponse
    executor: Optional[UserResponse]
    due_date: date
    extended_count: int
    photos: List[RequestPhotoResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RequestListItem(BaseModel):
    id: int
    building: BuildingResponse
    description: str
    status: str
    creator: UserResponse
    executor: Optional[UserResponse]
    due_date: date
    extended_count: int
    photos_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class RequestListResponse(BaseModel):
    items: List[RequestListItem]
    total: int
