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
