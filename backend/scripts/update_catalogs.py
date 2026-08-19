#!/usr/bin/env python3
"""
Скрипт для обновления справочников (услуг и материалов) из Excel-файла.

Старые записи деактивируются (soft delete), новые загружаются из файла.
Существующие выполненные работы не затрагиваются.

Использование:
    cd backend
    python scripts/update_catalogs.py ../"Перечень и стоимость работ_ подлежащих к исполнению по заявке.xlsx"
"""

import sys
import os
import pandas as pd
from sqlalchemy.orm import Session

# Добавляем путь к app для импорта
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.database import engine, SessionLocal
from app.models import Service, Material


def clean_name(name: str) -> str:
    """Очистка наименования от лишних пробелов, точек и табуляций."""
    if pd.isna(name):
        return ""
    # Удаляем табы, множественные пробелы, точки в начале/конце
    result = str(name).strip()
    # Удаляем точку в конце если есть (например "1.       ." -> "1")
    result = result.rstrip('.')
    # Удаляем множественные пробелы и табы
    result = ' '.join(result.split())
    return result


def parse_price(price_value) -> float:
    """Преобразование цены в float."""
    if pd.isna(price_value):
        return 0.0

    price_str = str(price_value).strip()

    # Убираем все виды пробелов (обычные и неразрывные)
    # Неразрывный пробел (U+00A0) и тонкие пробелы
    import re
    price_str = re.sub(r'[\s   ]', '', price_str)

    # Заменяем запятую на точку: "5439,50" -> "5439.50"
    price_str = price_str.replace(',', '.')

    try:
        return float(price_str)
    except ValueError:
        print(f"  ⚠ Не удалось преобразовать цену: '{price_value}' -> '{price_str}'")
        return 0.0


def update_services(db: Session, df_services: pd.DataFrame) -> dict:
    """Обновление справочника услуг."""
    print("\n=== Обновление услуг ===")

    # Деактивируем все существующие услуги
    existing_count = db.query(Service).filter(Service.is_active == True).count()
    print(f"Найдено активных услуг: {existing_count}")

    db.query(Service).filter(Service.is_active == True).update({Service.is_active: False})
    print(f"Деактивировано старых услуг: {existing_count}")

    created = 0
    errors = 0

    for idx, row in df_services.iterrows():
        try:
            # Получаем данные из столбцов
            # Структура: № | Наименование | Единица измерения | Кол-во | Цена
            raw_name = row.iloc[1]  # Наименование
            raw_unit = row.iloc[2]  # Единица измерения
            raw_price = row.iloc[4]  # Цена

            name = clean_name(raw_name)

            if not name or name.lower() in ['наименование услуг (работ)', 'nan']:
                continue

            unit = clean_name(raw_unit) if pd.notna(raw_unit) else None
            price = parse_price(raw_price)

            if price <= 0:
                print(f"  ⚠ Пропущено (цена <= 0): {name}")
                errors += 1
                continue

            # Создаём новую услугу
            service = Service(
                name=name,
                unit=unit,
                price=price,
                is_active=True
            )
            db.add(service)
            created += 1

        except Exception as e:
            errors += 1
            print(f"  ⚠ Ошибка в строке {idx + 2}: {e}")

    db.commit()
    print(f"✓ Создано новых услуг: {created}")
    print(f"✓ Ошибок: {errors}")

    return {"created": created, "errors": errors}


def update_materials(db: Session, df_materials: pd.DataFrame) -> dict:
    """Обновление справочника материалов."""
    print("\n=== Обновление материалов ===")

    # Деактивируем все существующие материалы
    existing_count = db.query(Material).filter(Material.is_active == True).count()
    print(f"Найдено активных материалов: {existing_count}")

    db.query(Material).filter(Material.is_active == True).update({Material.is_active: False})
    print(f"Деактивировано старых материалов: {existing_count}")

    created = 0
    errors = 0

    for idx, row in df_materials.iterrows():
        try:
            # Получаем данные из столбцов
            # Структура: № | Наименование | Единица измерения | Кол-во | Цена
            raw_name = row.iloc[1]  # Наименование
            raw_unit = row.iloc[2]  # Единица измерения
            raw_price = row.iloc[4]  # Цена

            name = clean_name(raw_name)

            if not name or name.lower() in ['наименование материалов применяемых при проведении работ', 'nan']:
                continue

            unit = clean_name(raw_unit) if pd.notna(raw_unit) else None
            price = parse_price(raw_price)

            if price <= 0:
                print(f"  ⚠ Пропущено (цена <= 0): {name}")
                errors += 1
                continue

            # Создаём новый материал
            material = Material(
                name=name,
                unit=unit,
                price=price,
                is_active=True
            )
            db.add(material)
            created += 1

        except Exception as e:
            errors += 1
            print(f"  ⚠ Ошибка в строке {idx + 2}: {e}")

    db.commit()
    print(f"✓ Создано новых материалов: {created}")
    print(f"✓ Ошибок: {errors}")

    return {"created": created, "errors": errors}


def main():
    if len(sys.argv) < 2:
        print("Использование: python scripts/update_catalogs.py <путь_к_excel_файлу>")
        print("Пример: python scripts/update_catalogs.py '../Перечень и стоимость работ_ подлежащих к исполнению по заявке.xlsx'")
        sys.exit(1)

    excel_path = sys.argv[1]

    if not os.path.exists(excel_path):
        print(f"❌ Файл не найден: {excel_path}")
        sys.exit(1)

    print(f"📂 Чтение файла: {excel_path}")

    try:
        # Читаем Excel-файл
        xl = pd.ExcelFile(excel_path)

        print(f"📋 Найденные листы: {', '.join(xl.sheet_names)}")

        df_services = None
        df_materials = None

        # Ищем лист с услугами и материалами
        for sheet_name in xl.sheet_names:
            if 'работ' in sheet_name.lower():
                # header=1 т.к. заголовки на второй строке
                df_services = pd.read_excel(excel_path, sheet_name=sheet_name, header=1)
                print(f"✓ Загружен лист услуг: {sheet_name} ({len(df_services)} строк)")
            elif 'материал' in sheet_name.lower():
                df_materials = pd.read_excel(excel_path, sheet_name=sheet_name, header=1)
                print(f"✓ Загружен лист материалов: {sheet_name} ({len(df_materials)} строк)")

        if df_services is None and df_materials is None:
            print("❌ Не найдено листов с услугами или материалами")
            sys.exit(1)

        # Работаем с БД
        db = SessionLocal()

        try:
            results = {}

            if df_services is not None:
                results['services'] = update_services(db, df_services)

            if df_materials is not None:
                results['materials'] = update_materials(db, df_materials)

            print("\n" + "=" * 50)
            print("=== ИТОГ ===")
            for key, value in results.items():
                print(f"{key}: создано {value['created']}, ошибок {value['errors']}")
            print("=" * 50)

        finally:
            db.close()

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
