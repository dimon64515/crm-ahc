from app.schemas import WorkUpdateAdmin


def test_work_update_admin_accepts_full_fields():
    data = {
        "building_id": 1,
        "service_id": 2,
        "user_id": 3,
        "work_date": "2026-06-20",
        "description": "Новое описание",
        "service_quantity": "15.00",
        "materials": [{"material_id": 5, "quantity": "2.5"}],
    }
    obj = WorkUpdateAdmin(**data)
    assert obj.building_id == 1
    assert obj.service_id == 2
    assert obj.user_id == 3
    assert obj.materials[0].material_id == 5
