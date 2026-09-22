from src.api.routes import templates as templates_routes


def test_normalize_section_values_returns_only_that_section_fields():
    for section, fields in templates_routes._SETTINGS_SECTIONS.items():
        result = templates_routes._normalize_section_values(section, {})
        assert set(result.keys()) == set(fields)


def test_section_scoped_update_leaves_other_sections_untouched():
    """Mirrors what TemplateRepository.update_settings_partial does
    (`{**current, **partial}`) — the guarantee behind the Testing tab's
    "Update template only touches this feature" button."""
    baseline = templates_routes.normalize_template_settings(
        {
            "font_family": "Inter",
            "font_size": 40,
            "hook_style": {"hook_position": "top"},
            "cut_long_pauses": True,
            "pause_threshold_ms": 700,
        }
    )

    partial = templates_routes._normalize_section_values(
        "hooks", {"hook_style": {"hook_position": "bottom", "hook_animation": "bounce"}}
    )
    merged = {**baseline, **partial}

    assert merged["hook_style"]["hook_position"] == "bottom"
    # Every field outside the "hooks" section is byte-identical to baseline.
    for key, value in baseline.items():
        if key in templates_routes._SETTINGS_SECTIONS["hooks"]:
            continue
        assert merged[key] == value


def test_emoji_and_safe_zone_sections_round_trip():
    values = {
        "emoji_defaults": {
            "default_animation_style": "zoom_punch",
            "default_duration_seconds": 2.0,
            "default_position": {"x_pct": 0.2, "y_pct": 0.8},
        },
        "safe_zone_enabled_default": True,
        "safe_zone_platform_default": "tiktok",
    }
    emoji_partial = templates_routes._normalize_section_values("emoji", values)
    safe_zone_partial = templates_routes._normalize_section_values("safe_zones", values)

    assert emoji_partial["emoji_defaults"]["default_animation_style"] == "zoom_punch"
    assert safe_zone_partial["safe_zone_enabled_default"] is True
    assert safe_zone_partial["safe_zone_platform_default"] == "tiktok"


def test_stored_cleanup_settings_survive_a_migrate_round_trip():
    """Regression test: a template created with explicit cut_long_pauses/
    pause_threshold_ms and remove_filler_words left off must not have
    remove_filler_words flip to True the next time it's read back (e.g. via
    GET /templates/{id}, which calls migrate_template_settings on the
    already-stored row). The bug was that the stored, display-only
    `sensitivity` value got treated as fresh slider input on re-read,
    force-deriving the booleans from it."""
    created = templates_routes.normalize_template_settings(
        {"cut_long_pauses": True, "pause_threshold_ms": 800}
    )
    assert created["cut_long_pauses"] is True
    assert created["remove_filler_words"] is False
    assert created["sensitivity"] == 78

    reread = templates_routes.migrate_template_settings(
        created, templates_routes.TEMPLATE_SCHEMA_VERSION
    )
    assert reread["cut_long_pauses"] is True
    assert reread["remove_filler_words"] is False
    assert reread["filtered_words"] == []
    assert reread["pause_threshold_ms"] == 800

    # Stable under further re-reads (list/apply/duplicate all call this too).
    reread_again = templates_routes.migrate_template_settings(
        reread, templates_routes.TEMPLATE_SCHEMA_VERSION
    )
    assert reread_again == reread
