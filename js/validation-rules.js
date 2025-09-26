/**
 * Centralized validation rules for all calculators.
 * Each key corresponds to a specific calculator.
 *
 * Rule properties:
 * - min: The minimum allowed value (for numbers).
 * - max: The maximum allowed value (for numbers).
 * - required: A boolean indicating if the field must have a non-zero/non-empty value.
 * - label: A user-friendly name for the input field used in error messages.
 */
const validationRules = {
    wind: {
        'mean_roof_height': { min: 0.001, max: 2000, required: true, label: 'Mean Roof Height' },
        'basic_wind_speed': { min: 0.001, max: 300, required: true, label: 'Basic Wind Speed' },
        'building_length_L': { min: 0.001, required: true, label: 'Building Length (L)' },
        'building_width_B': { min: 0.001, required: true, label: 'Building Width (B)' },
        'roof_slope_deg': { min: 0, max: 90, required: false, label: 'Roof Slope' }
    },
    snow: {
        'ground_snow_load': { min: 0.001, max: 300, required: true, label: 'Ground Snow Load' }
    },
    rain: {
        'tributary_area': { min: 0.001, required: true, label: 'Tributary Area' },
        'intensity': { min: 0.001, required: true, label: 'Rainfall Intensity' }
    },
    combo: {
        'dead_load_d': { min: 0.001, required: true, label: 'Dead Load (D)' },
        'live_load_l': { required: false, label: 'Live Load (L)' },
        'roof_live_load_lr': { required: false, label: 'Roof Live Load (Lr)' },
        'rain_load_r': { required: false, label: 'Rain Load (R)' },
        'balanced_snow_load_sb': { required: false, label: 'Balanced Snow (Sb)' },
        'wind_wall_ww_max': { required: false, label: 'Windward Wall Max Wind' },
        'seismic_load_e': { required: false, label: 'Seismic Load (E)' }
    },
    baseplate: {
        'base_plate_length_N': { min: 0.001, required: true, label: 'Plate Length (N)' },
        'base_plate_width_B': { min: 0.001, required: true, label: 'Plate Width (B)' },
        'provided_plate_thickness_tp': { min: 0.001, required: true, label: 'Plate Thickness' },
        'column_depth_d': { min: 0.001, required: true, label: 'Column Depth' },
        'column_flange_width_bf': { min: 0.001, required: true, label: 'Column Flange Width' },
        'base_plate_Fy': { min: 0.001, required: true, label: 'Plate Fy' },
        'concrete_fc': { min: 0.001, required: true, label: 'Concrete f\'c' },
        'anchor_bolt_diameter': { min: 0.001, required: true, label: 'Bolt Diameter' },
        'anchor_embedment_hef': { min: 0.001, required: true, label: 'Bolt Embedment (hef)' },
    },
    wood: {
        'Fb_unadjusted': { min: 0.001, required: true, label: 'Fb' },
        'Fv_unadjusted': { min: 0.001, required: true, label: 'Fv' },
        'Fc_unadjusted': { min: 0.001, required: true, label: 'Fc' },
        'E_unadjusted': { min: 0.001, required: true, label: 'E' },
        'E_min_unadjusted': { min: 0.001, required: true, label: 'E_min' },
        'b_width': { min: 0.001, required: true, label: 'Width (b)' },
        'd_depth': { min: 0.001, required: true, label: 'Depth (d)' },
        'unbraced_length_L': { min: 0.001, required: true, label: 'Unbraced Length (L)' },
        'effective_length_factor_K': { min: 0.001, required: true, label: 'K Factor' },
    },
    steel_check: {
        'Fy': { min: 0.1, max: 150, required: true, label: 'Yield Strength (Fy)' },
        'Fu': { min: 0.1, max: 200, required: true, label: 'Ultimate Strength (Fu)' },
        'E': { min: 20000, max: 35000, required: true, label: 'Modulus of Elasticity (E)' },
        'd': { min: 0.001, required: true, label: 'Depth/Height' },
        'bf': { min: 0.001, required: true, label: 'Width/Flange Width' },
        'tf': { min: 0.001, required: true, label: 'Thickness/Flange Thickness' },
        'Lb_input': { min: 0, required: true, label: 'Unbraced Length (Lb)' },
    },
    splice: {
        'member_d': { min: 1, required: true, label: 'Member Depth' },
        'member_bf': { min: 1, required: true, label: 'Member Flange Width' },
        'member_tf': { min: 0.1, required: true, label: 'Member Flange Thickness' },
        'member_tw': { min: 0.1, required: true, label: 'Member Web Thickness' },
        'member_Fy': { min: 36, required: true, label: 'Member Fy' },
        'H_fp': { min: 1, required: true, label: 'Flange Plate Width' },
        't_fp': { min: 0.1, required: true, label: 'Flange Plate Thickness' },
        'L_fp': { min: 1, required: true, label: 'Flange Plate Length' },
        'H_wp': { min: 1, required: true, label: 'Web Plate Height' },
        't_wp': { min: 0.1, required: true, label: 'Web Plate Thickness' },
        'L_wp': { min: 1, required: true, label: 'Web Plate Length' },
        'D_fp': { min: 0.1, required: true, label: 'Flange Bolt Diameter' },
        'D_wp': { min: 0.1, required: true, label: 'Web Bolt Diameter' },
    }
};