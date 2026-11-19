/* =========================================================
   FitScale – BMI Calculator logic
   Sections:
   1. Configuration (limits & categories)
   2. DOM references
   3. Navigation (mobile menu + active link)
   4. Validation
   5. BMI calculation & classification
   6. Rendering results and chart
   7. Reset
   8. Event wiring
   ========================================================= */

(function () {
  'use strict';

  /* ---------- 1. Configuration ---------- */

  // Realistic input limits for adults. Values outside these are rejected.
  const LIMITS = {
    age:    { min: 20,  max: 120 },
    weight: { min: 20,  max: 350 }, // kg
    height: { min: 100, max: 250 }  // cm
  };

  // The chart's visible scale runs from BMI 10 to BMI 40.
  const CHART_MIN = 10;
  const CHART_MAX = 40;

  // Standard adult BMI categories (WHO / CDC).
  // `max` is exclusive, so 24.99 is "healthy" and 25.0 is "overweight".
  const CATEGORIES = [
    {
      id: 'underweight',
      label: 'Underweight',
      max: 18.5,
      color: '#2563eb',
      text: 'Your BMI is below the healthy range for adults. A low BMI can sometimes be linked to undernutrition, weaker bones or a reduced immune system. Consider speaking with a healthcare professional for personalised advice.'
    },
    {
      id: 'healthy',
      label: 'Healthy weight',
      max: 25,
      color: '#059669',
      text: 'Your BMI is within the healthy range for adults. Keep in mind that BMI is only one indicator — regular activity, a balanced diet and good sleep all matter for long-term health.'
    },
    {
      id: 'overweight',
      label: 'Overweight',
      max: 30,
      color: '#d97706',
      text: 'Your BMI is above the healthy range for adults. This can be linked to a higher risk of some health conditions, although muscle mass and body shape also affect the number. A healthcare professional can help put it in context.'
    },
    {
      id: 'obesity',
      label: 'Obesity',
      max: Infinity,
      color: '#dc2626',
      text: 'Your BMI is in the obesity range for adults. This is associated with a higher risk of conditions such as type 2 diabetes, high blood pressure and heart disease. A healthcare professional can offer a full assessment and support.'
    }
  ];

  /* ---------- 2. DOM references ---------- */
  const form          = document.getElementById('bmiForm');
  const resetBtn      = document.getElementById('resetBtn');
  const resultCard    = document.getElementById('resultCard');
  const resultEmpty   = document.getElementById('resultEmpty');
  const resultFilled  = document.getElementById('resultFilled');
  const bmiValueEl    = document.getElementById('bmiValue');
  const bmiBadgeEl    = document.getElementById('bmiBadge');
  const explanationEl = document.getElementById('bmiExplanation');
  const healthyEl     = document.getElementById('healthyRange');
  const marker        = document.getElementById('gaugeMarker');
  const markerLabel   = document.getElementById('markerLabel');
  const chartNote     = document.getElementById('chartNote');
  const tableRows     = document.querySelectorAll('.bmi-table tbody tr');

  const inputs = {
    age:    document.getElementById('age'),
    weight: document.getElementById('weight'),
    height: document.getElementById('height')
  };

  /* ---------- 3. Navigation ---------- */
  const navToggle = document.getElementById('navToggle');
  const nav       = document.getElementById('primaryNav');
  const navLinks  = nav.querySelectorAll('a');

  function setMenu(open) {
    nav.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  navToggle.addEventListener('click', function () {
    setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
  });

  // Close the mobile menu after choosing a link
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () { setMenu(false); });
  });

  // Close the mobile menu with the Escape key and return focus to the toggle
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setMenu(false);
      navToggle.focus();
    }
  });

  // Highlight the nav link for the section currently on screen
  if ('IntersectionObserver' in window) {
    const sectionIds = ['home', 'calculator', 'information', 'faq'];
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          const isActive = link.getAttribute('href') === '#' + entry.target.id;
          link.classList.toggle('active', isActive);
          if (isActive) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sectionIds.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  /* ---------- 4. Validation ---------- */

  /**
   * Validate one field. Returns the parsed number, or null if invalid.
   * Shows an inline error message and sets aria-invalid for screen readers.
   */
  function validateField(name, friendlyName, unitLabel) {
    const input  = inputs[name];
    const errEl  = document.getElementById(name + '-error');
    const raw    = input.value.trim();
    const limits = LIMITS[name];
    let message  = '';

    if (raw === '') {
      message = 'Please enter your ' + friendlyName + '.';
    } else if (!/^\d+([.,]\d+)?$/.test(raw) || isNaN(parseFloat(raw.replace(',', '.')))) {
      // Rejects letters, negative numbers and symbols
      message = 'Please enter a valid positive number.';
    } else {
      const value = parseFloat(raw.replace(',', '.'));

      if (name === 'age' && value < LIMITS.age.min) {
        message = 'This calculator uses adult categories and is for ages 20 and over. Under 20s should use age-specific BMI percentiles.';
      } else if (name === 'age' && !Number.isInteger(value)) {
        message = 'Please enter your age in whole years.';
      } else if (value < limits.min || value > limits.max) {
        message = 'Please enter a realistic ' + friendlyName + ' between ' +
                  limits.min + ' and ' + limits.max + (unitLabel ? ' ' + unitLabel : '') + '.';
      } else {
        // Valid – clear any previous error
        input.removeAttribute('aria-invalid');
        errEl.textContent = '';
        return value;
      }
    }

    input.setAttribute('aria-invalid', 'true');
    errEl.textContent = message;
    return null;
  }

  // Clear a field's error as soon as the user edits it
  Object.keys(inputs).forEach(function (name) {
    inputs[name].addEventListener('input', function () {
      inputs[name].removeAttribute('aria-invalid');
      document.getElementById(name + '-error').textContent = '';
    });
  });

  /* ---------- 5. BMI calculation & classification ---------- */

  /** BMI = weight (kg) / height (m)^2 */
  function calculateBMI(weightKg, heightCm) {
    const heightM = heightCm / 100;
    return weightKg / (heightM * heightM);
  }

  /** Return the category object for a BMI (uses the value rounded to 1 decimal,
   *  so the displayed number and the category always agree). */
  function getCategory(bmiRounded) {
    return CATEGORIES.find(function (cat) { return bmiRounded < cat.max; });
  }

  /** Weight range (kg) that gives a healthy BMI (18.5–24.9) at this height. */
  function healthyWeightRange(heightCm) {
    const h2 = Math.pow(heightCm / 100, 2);
    return { min: 18.5 * h2, max: 24.9 * h2 };
  }

  /* ---------- 6. Rendering ---------- */

  function showResult(bmi, heightCm) {
    const rounded  = Math.round(bmi * 10) / 10;
    const category = getCategory(rounded);
    const range    = healthyWeightRange(heightCm);

    // Text values
    bmiValueEl.textContent    = rounded.toFixed(1);
    bmiBadgeEl.textContent    = category.label;
    explanationEl.textContent = category.text;
    healthyEl.textContent     = range.min.toFixed(1) + ' – ' + range.max.toFixed(1) + ' kg';

    // Colour theme for the result card (read by CSS via --cat-color)
    resultCard.style.setProperty('--cat-color', category.color);
    resultCard.classList.add('is-filled');

    // Toggle empty / filled states and replay the pop-in animation
    resultEmpty.hidden  = true;
    resultFilled.hidden = false;
    resultFilled.classList.remove('animate');
    void resultFilled.offsetWidth; // forces reflow so the animation restarts
    resultFilled.classList.add('animate');

    updateChart(rounded, category);
  }

  /** Move the chart marker and highlight the matching table row. */
  function updateChart(bmi, category) {
    // Clamp to the visible chart range so extreme values stay on the bar
    const clamped = Math.min(Math.max(bmi, CHART_MIN), CHART_MAX);
    const percent = ((clamped - CHART_MIN) / (CHART_MAX - CHART_MIN)) * 100;

    marker.hidden = false;
    marker.style.left = percent + '%';
    markerLabel.textContent = bmi.toFixed(1);

    chartNote.textContent = 'Your BMI of ' + bmi.toFixed(1) + ' falls in the "' +
                            category.label + '" category.';

    tableRows.forEach(function (row) {
      row.classList.toggle('is-current', row.dataset.category === category.id);
    });
  }

  /* ---------- 7. Reset ---------- */
  function resetCalculator() {
    form.reset();

    Object.keys(inputs).forEach(function (name) {
      inputs[name].removeAttribute('aria-invalid');
      document.getElementById(name + '-error').textContent = '';
    });

    resultFilled.hidden = true;
    resultEmpty.hidden  = false;
    resultCard.classList.remove('is-filled');
    resultCard.style.removeProperty('--cat-color');

    marker.hidden = true;
    marker.style.left = '0%';
    chartNote.textContent = 'Calculate your BMI to see where you sit on the scale.';
    tableRows.forEach(function (row) { row.classList.remove('is-current'); });

    inputs.age.focus();
  }

  /* ---------- 8. Event wiring ---------- */

  // Submitting the form (Calculate button or Enter key) runs the calculation
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const age    = validateField('age', 'age', 'years');
    const weight = validateField('weight', 'weight', 'kg');
    const height = validateField('height', 'height', 'cm');

    if (age === null || weight === null || height === null) {
      // Move focus to the first invalid field so keyboard users can fix it
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const bmi = calculateBMI(weight, height);
    showResult(bmi, height);

    // On small screens, scroll the result into view
    if (window.matchMedia('(max-width: 780px)').matches) {
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  resetBtn.addEventListener('click', resetCalculator);

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();
})();
