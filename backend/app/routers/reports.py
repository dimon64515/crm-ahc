import os
from io import BytesIO
from datetime import datetime
from decimal import Decimal
from typing import List

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl.drawing.image import Image as XLImage
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Work, Building, Service, User, WorkMaterial
from app.schemas import SummaryReportItem
from app.core.dependencies import get_current_user, require_director
from app.core.config import get_settings

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
def get_summary_report(
    date_from: str = None,
    date_to: str = None,
    group_by: str = "building",
    building_id: str = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_director)
):
    query = db.query(Work)
    
    if date_from:
        query = query.filter(Work.work_date >= date_from)
    if date_to:
        query = query.filter(Work.work_date <= date_to)
    if building_id:
        query = query.filter(Work.building_id == int(building_id))
    
    works = query.all()
    
    # Группировка
    groups = {}
    for work in works:
        if group_by == "building":
            key = work.building.number
            name = f"Корпус {work.building.number}"
        elif group_by == "service":
            key = work.service.name
            name = work.service.name
        elif group_by == "contractor":
            key = work.user.full_name or work.user.username
            name = key
        else:
            key = work.work_date.strftime("%Y-%m-%d")
            name = key
        
        if key not in groups:
            groups[key] = {
                "group_key": key,
                "group_name": name,
                "works_count": 0,
                "service_total": Decimal('0'),
                "materials_total": Decimal('0'),
                "total": Decimal('0'),
            }
        
        groups[key]["works_count"] += 1
        groups[key]["service_total"] += work.service_total_price or 0
        groups[key]["materials_total"] += work.materials_total_price or 0
        groups[key]["total"] += work.total_price or 0
    
    items = list(groups.values())
    totals = {
        "works_count": sum(i["works_count"] for i in items),
        "service_total": sum(i["service_total"] for i in items),
        "materials_total": sum(i["materials_total"] for i in items),
        "total": sum(i["total"] for i in items),
    }
    
    return {
        "group_by": group_by,
        "items": items,
        "totals": totals,
    }


@router.get("/export")
def export_works(
    date_from: str = None,
    date_to: str = None,
    building_id: str = None,
    service_id: str = None,
    user_id: str = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_director)
):
    query = db.query(Work)
    
    if date_from:
        query = query.filter(Work.work_date >= date_from)
    if date_to:
        query = query.filter(Work.work_date <= date_to)
    if building_id:
        query = query.filter(Work.building_id == int(building_id))
    if service_id:
        query = query.filter(Work.service_id == int(service_id))
    if user_id:
        query = query.filter(Work.user_id == int(user_id))
    
    works = query.order_by(Work.work_date.desc()).all()
    
    settings = get_settings()
    
    # Определяем максимальное количество фото
    max_photos = 0
    for work in works:
        max_photos = max(max_photos, len(work.photos or []))
    
    # Формирование DataFrame — каждая работа = 1 строка, фото в колонках
    base_columns = [
        "Дата", "Корпус", "Подрядчик", "Вид работы", "Наименование",
        "Ед.изм.", "Кол-во", "Цена работы", "Сумма работы",
        "Материалы", "Сумма материалов", "ИТОГО"
    ]
    photo_columns = [f"Фото {i+1}" for i in range(max_photos)] if max_photos else []
    all_columns = base_columns + photo_columns
    
    data = []
    photo_map = []  # [(excel_row_idx, col_idx, photo_file_path), ...]
    
    for work in works:
        materials_str = ", ".join([
            f"{wm.material.name} ({wm.quantity} {wm.material.unit or 'шт'})"
            for wm in work.work_materials
        ]) if work.work_materials else ""
        
        row = {
            "Дата": work.work_date,
            "Корпус": work.building.number,
            "Подрядчик": work.user.full_name or work.user.username,
            "Вид работы": work.service.name,
            "Наименование": work.description,
            "Ед.изм.": work.service.unit,
            "Кол-во": float(work.service_quantity) if work.service_quantity else 0,
            "Цена работы": float(work.service_unit_price) if work.service_unit_price else 0,
            "Сумма работы": float(work.service_total_price) if work.service_total_price else 0,
            "Материалы": materials_str,
            "Сумма материалов": float(work.materials_total_price) if work.materials_total_price else 0,
            "ИТОГО": float(work.total_price) if work.total_price else 0,
        }
        
        work_photos = work.photos or []
        for i, photo in enumerate(work_photos):
            row[f"Фото {i+1}"] = photo.filename
        
        data.append(row)
        photo_map.append(work_photos)
    
    df = pd.DataFrame(data, columns=all_columns)
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Работы')
        ws = writer.sheets['Работы']
        
        # Настройка колонок фото
        for i in range(max_photos):
            col_idx = len(base_columns) + i + 1  # 1-based
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = 22
        
        # Вставка изображений
        for row_idx, photos in enumerate(photo_map, start=2):  # start=2 т.к. первая строка — заголовок
            if not photos:
                continue
            for photo_idx, photo in enumerate(photos):
                col_idx = len(base_columns) + photo_idx + 1
                col_letter = get_column_letter(col_idx)
                img_path = photo.file_path
                if img_path and os.path.exists(img_path):
                    try:
                        img = XLImage(img_path)
                        img.width = 160
                        img.height = 120
                        cell = f"{col_letter}{row_idx}"
                        ws.add_image(img, cell)
                        ws.row_dimensions[row_idx].height = 100
                    except Exception:
                        pass
    
    output.seek(0)
    
    filename = f"works_report_{date_from or 'all'}_{date_to or 'all'}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/summary/export")
def export_summary(
    date_from: str = None,
    date_to: str = None,
    group_by: str = "building",
    db: Session = Depends(get_db),
    current_user = Depends(require_director)
):
    report = get_summary_report(date_from, date_to, group_by, None, db, current_user)
    
    df = pd.DataFrame(report["items"])
    
    # Добавление итогов
    totals = report["totals"]
    df.loc[len(df)] = {
        "group_name": "ИТОГО",
        "works_count": totals["works_count"],
        "service_total": totals["service_total"],
        "materials_total": totals["materials_total"],
        "total": totals["total"],
    }
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Сводный отчёт')
    
    output.seek(0)
    
    filename = f"works_summary_{group_by}_{date_from or 'all'}_{date_to or 'all'}.xlsx"
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
