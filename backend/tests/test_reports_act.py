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
    request_id = 42
    work_materials = []


def test_act_table_has_work_date_column():
    output = generate_act_docx([FakeWork()])
    doc = Document(output)
    tables = [t for t in doc.tables if any(cell.text == "Наименование работ" for cell in t.rows[0].cells)]
    assert tables, "Таблица работ не найдена"
    header = [cell.text for cell in tables[0].rows[0].cells]
    assert "Дата работ" in header, f"Столбец 'Дата работ' отсутствует: {header}"


def test_act_table_has_request_id_column():
    output = generate_act_docx([FakeWork()])
    doc = Document(output)
    tables = [t for t in doc.tables if any(cell.text == "Наименование работ" for cell in t.rows[0].cells)]
    assert tables, "Таблица работ не найдена"
    header = [cell.text for cell in tables[0].rows[0].cells]
    assert "№ заявки" in header, f"Столбец '№ заявки' отсутствует: {header}"
    row_values = [cell.text for cell in tables[0].rows[1].cells]
    assert row_values[1] == "42", f"Номер заявки не выведен: {row_values}"


def test_act_table_request_id_is_blank_for_unlinked_work():
    class UnlinkedFakeWork(FakeWork):
        request_id = None

    output = generate_act_docx([UnlinkedFakeWork()])
    doc = Document(output)
    tables = [t for t in doc.tables if any(cell.text == "Наименование работ" for cell in t.rows[0].cells)]
    row_values = [cell.text for cell in tables[0].rows[1].cells]
    assert row_values[1] == "", f"Поле № заявки должно быть пустым: {row_values}"


def test_act_header_date_is_russian():
    russian_months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ]
    output = generate_act_docx([FakeWork()])
    doc = Document(output)
    found = False
    for p in doc.paragraphs:
        if "г. Пятигорск" in p.text and any(month in p.text for month in russian_months):
            found = True
            break
    assert found, "Русская дата в шапке акта не найдена"
