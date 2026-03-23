from __future__ import annotations

from pathlib import Path
import shutil
import zipfile

from openpyxl import Workbook


ROOT = Path(__file__).parent / "demo"
SOURCE_DIR = ROOT / "source"
ZIP_NAME = "PeopleCounter_Zurich_2026-03-10.zip"
EXTRACTED_NAME = "Zurich.xlsx"


def reset_demo_tree() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)


def build_workbook(target_path: Path) -> None:
    workbook = Workbook()
    sheet1 = workbook.active
    sheet1.title = "Report"
    sheet2 = workbook.create_sheet("Visitors")

    sheet1["A6"] = "Berichtszeit: 2026/03/10 00:00:00 - 2026/03/10 23:59:59"

    sheet2["A11"] = 120
    sheet2["C11"] = 135
    sheet2["E11"] = 15

    age_rows = [
        (13, "0-9", 5),
        (14, "10-19", 17),
        (15, "20-29", 44),
        (16, "30-39", 53),
        (17, "40-49", 60),
        (18, "50-59", 38),
        (19, "60-69", 28),
        (20, "70+", 10),
    ]
    for row_index, age_bucket, visitors_count in age_rows:
        sheet2[f"C{row_index}"] = age_bucket
        sheet2[f"D{row_index}"] = visitors_count

    hourly_totals = [12, 18, 21, 28, 30, 36, 31, 29, 27, 22, 18, 16, 14, 10, 9, 7]
    for offset, row_index in enumerate(range(33, 49)):
        total = hourly_totals[offset]
        sheet2[f"B{row_index}"] = f"{8 + offset:02d}:00"
        sheet2[f"C{row_index}"] = total // 3
        sheet2[f"E{row_index}"] = total // 3
        sheet2[f"G{row_index}"] = total - (2 * (total // 3))

    workbook.save(target_path)
    workbook.close()


def build_zip(source_file: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(source_file, arcname=source_file.name)


def main() -> None:
    reset_demo_tree()
    workbook_path = SOURCE_DIR / EXTRACTED_NAME
    zip_path = SOURCE_DIR / ZIP_NAME
    build_workbook(workbook_path)
    build_zip(workbook_path, zip_path)
    workbook_path.unlink()
    print(f"Demo ZIP created: {zip_path}")


if __name__ == "__main__":
    main()