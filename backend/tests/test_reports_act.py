import os
from datetime import date
from decimal import Decimal

from docx import Document

from app.routers.reports import generate_act_docx


class FakeUser:
    full_name = "Иванов И.И."
    username = "ivanov"


class FakeBuilding:
    number = "5"
    name = "Главный"


class FakeService:
    name = "Ремонт кровли"
    unit = "м2"


class FakeWork:
    work_date = date(2026, 6, 15)
    building = FakeBuilding()
    service = FakeService()
    service_quantity = Decimal("10.5")
    service_unit_price = Decimal("1200.00")
    service_total_price = Decimal("12600.00")
    total_price = Decimal("12600.00")
    work_materials = []


def test_act_table_has_work_date_column():
    output = generate_act_docx([FakeWork()])
    doc = Document(output)
    tables = [t for t in doc.tables if any(cell.text == "Наименование работ" for cell in t.rows[0].cells)]
    assert tables, "Таблица работ не найдена"
    header = [cell.text for cell in tables[0].rows[0].cells]
    assert "Дата работ" in header, f"Столбец 'Дата работ' отсутствует: {header}"
