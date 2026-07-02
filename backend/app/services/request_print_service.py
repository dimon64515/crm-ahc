import io
import os
import re
from datetime import datetime
from typing import Optional

from docx import Document

from app.core.config import get_settings
from app.models import Request


REQUEST_TEMPLATE_FILENAME = "Заявка чист.docx"


def _get_template_path() -> str:
    settings = get_settings()
    return os.path.join(settings.UPLOAD_DIR, REQUEST_TEMPLATE_FILENAME)


def _format_date(d: Optional[datetime]) -> str:
    if not d:
        return ""
    return d.strftime("%d.%m.%Y")


def _replace_in_paragraph(paragraph, old_text: str, new_text: str) -> bool:
    """Заменяет подстроку в абзаце, даже если текст разбит на несколько run."""
    full_text = paragraph.text
    if old_text not in full_text:
        return False

    new_full_text = full_text.replace(old_text, new_text, 1)
    # Сохраняем стиль первого run, если есть
    first_run = paragraph.runs[0] if paragraph.runs else None
    font = first_run.font if first_run else None

    paragraph.clear()
    run = paragraph.add_run(new_full_text)
    if font:
        run.font.name = font.name
        run.font.size = font.size
        run.bold = font.bold
        run.italic = font.italic
    return True


def _replace_first_in_doc(doc, old_text: str, new_text: str) -> bool:
    """Заменяет первое вхождение подстроки в документе (абзацы, затем таблицы)."""
    for paragraph in doc.paragraphs:
        if old_text in paragraph.text:
            _replace_in_paragraph(paragraph, old_text, new_text)
            return True
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    if old_text in paragraph.text:
                        _replace_in_paragraph(paragraph, old_text, new_text)
                        return True
    return False


def _set_cell_text(cell, text: str):
    """Очищает ячейку таблицы и записывает новый текст."""
    cell.text = text


def fill_request_template(request: Request) -> io.BytesIO:
    """Заполняет шаблон заявки данными из модели Request и возвращает DOCX в BytesIO."""
    template_path = _get_template_path()
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Шаблон заявки не найден: {template_path}")

    doc = Document(template_path)

    building_number = request.building.number if request.building else ""
    building_address = request.building.address or request.building.name or ""
    creator_name = request.creator.full_name or request.creator.username if request.creator else ""
    executor_name = request.executor.full_name or request.executor.username if request.executor else ""
    description = request.description or ""

    # Корпус
    _replace_first_in_doc(doc, "Корпус № ____", f"Корпус № {building_number}")

    # Адрес: заменяем подчёркивание вместе со словом "ул." на адрес корпуса.
    _replace_first_in_doc(
        doc,
        "ул. _______________________)",
        f"{building_address})" if building_address else "ул. _______________________)",
    )

    # Верхние поля: должность и ФИО заявителя.
    # В шаблоне перед метками "должность" и "ФИО" идут строки с подчёркиванием.
    for i, paragraph in enumerate(doc.paragraphs):
        text = paragraph.text.strip()
        next_text = doc.paragraphs[i + 1].text.strip() if i + 1 < len(doc.paragraphs) else ""

        if re.fullmatch(r"_+", text):
            if next_text.lower() == "должность":
                paragraph.clear()
                paragraph.add_run("Вахтер")
            elif next_text.lower() == "фио":
                paragraph.clear()
                paragraph.add_run(creator_name)

    # Решение и исполнитель
    for paragraph in doc.paragraphs:
        if "ПРИНЯТО РЕШЕНИЕ" in paragraph.text:
            if executor_name:
                paragraph.add_run(f" {executor_name}")
            break

    # Дата исполнения
    completed_date = ""
    if request.status == "completed" and request.updated_at:
        completed_date = _format_date(request.updated_at)

    for paragraph in doc.paragraphs:
        if "ИСПОЛНЕНО" in paragraph.text:
            _replace_in_paragraph(paragraph, "______________", completed_date or "______________")
            break

    # Таблица дефектов/работ
    if doc.tables:
        table = doc.tables[0]
        if len(table.rows) > 1:
            row = table.rows[1]
            if len(row.cells) >= 4:
                _set_cell_text(row.cells[0], building_number)
                _set_cell_text(row.cells[1], description)
                _set_cell_text(row.cells[2], "шт")
                _set_cell_text(row.cells[3], "1")

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output
