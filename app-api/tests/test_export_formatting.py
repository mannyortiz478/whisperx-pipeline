import io
import tempfile
from pathlib import Path
import pytest

pytestmark = pytest.mark.unit


def test_generate_txt_with_timestamps(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_txt
    with app.app_context():
        job = db.session.get(Job, sample_job_with_data['job_id'])
        result = generate_txt(job.segments, include_timestamps=True)
    assert '[00:00]' in result or '[' in result
    assert 'Speaker 1' in result
    assert 'Thanks everyone for joining today.' in result


def test_generate_txt_without_timestamps(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_txt
    with app.app_context():
        job = db.session.get(Job, sample_job_with_data['job_id'])
        result = generate_txt(job.segments, include_timestamps=False)
    # No timestamp brackets
    lines = result.splitlines()
    for line in lines:
        assert not line.startswith('['), f"Unexpected timestamp in: {line}"
    assert 'Speaker 1' in result
    assert 'Thanks everyone for joining today.' in result


def test_generate_txt_all_three_segments(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_txt
    with app.app_context():
        job = db.session.get(Job, sample_job_with_data['job_id'])
        result = generate_txt(job.segments, include_timestamps=True)
    assert 'Thanks everyone for joining today.' in result
    assert 'Happy to be here.' in result
    assert 'I will follow up by Friday.' in result


def test_generate_docx_creates_file(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_docx
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = str(Path(tmpdir) / 'transcript.docx')
        with app.app_context():
            job = db.session.get(Job, sample_job_with_data['job_id'])
            generate_docx(
                job=job,
                segments=job.segments,
                speakers=job.speakers,
                action_items=job.actions,
                output_path=output_path,
                include_timestamps=True,
            )
        assert Path(output_path).exists()
        assert Path(output_path).stat().st_size > 1000


def test_generate_docx_without_timestamps(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_docx
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = str(Path(tmpdir) / 'transcript_no_ts.docx')
        with app.app_context():
            job = db.session.get(Job, sample_job_with_data['job_id'])
            generate_docx(
                job=job,
                segments=job.segments,
                speakers=job.speakers,
                action_items=job.actions,
                output_path=output_path,
                include_timestamps=False,
            )
        assert Path(output_path).exists()
        assert Path(output_path).stat().st_size > 1000


def test_generate_pdf_creates_file(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_pdf
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = str(Path(tmpdir) / 'transcript.pdf')
        with app.app_context():
            job = db.session.get(Job, sample_job_with_data['job_id'])
            generate_pdf(
                job=job,
                segments=job.segments,
                speakers=job.speakers,
                action_items=job.actions,
                output_path=output_path,
                include_timestamps=True,
            )
        assert Path(output_path).exists()
        with open(output_path, 'rb') as f:
            assert f.read(4) == b'%PDF'


def test_generate_pdf_without_timestamps(sample_job_with_data, app):
    from app import Job, db
    from exporters import generate_pdf
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = str(Path(tmpdir) / 'transcript_no_ts.pdf')
        with app.app_context():
            job = db.session.get(Job, sample_job_with_data['job_id'])
            generate_pdf(
                job=job,
                segments=job.segments,
                speakers=job.speakers,
                action_items=job.actions,
                output_path=output_path,
                include_timestamps=False,
            )
        assert Path(output_path).exists()
        assert Path(output_path).stat().st_size > 0
