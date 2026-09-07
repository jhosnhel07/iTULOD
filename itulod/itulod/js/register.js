/* iTULOD — registration page script (extracted from register.html). */
      /* ============================================================
   Registration Wizard — UI Logic
   ============================================================ */

      let currentStep = 0;
      let selectedRole = "customer";
      let selectedVehicle = "Motorcycle";
      const REGISTER_DRAFT_KEY = "itulod-register-draft";
      const vehicleModelsByType = {
        Motorcycle: [
          "Honda Click 125",
          "Honda Beat",
          "Honda Wave",
          "Honda XRM",
          "Honda TMX",
          "Honda Supra",
          "Honda CB110",
          "Honda CBR150",
          "Honda ADV150",
          "Yamaha Mio",
          "Yamaha Mio Soul",
          "Yamaha NMAX",
          "Yamaha Aerox",
          "Yamaha FZ",
          "Yamaha R15",
          "Suzuki Raider",
          "Suzuki Smash",
          "Suzuki Satria",
          "Suzuki Address",
          "Kymco Like",
          "Kymco Dink",
          "Kymco Zing",
          "TVS Rx",
          "TVS XL",
          "TVS Apache",
          "Bajaj CT100",
          "Bajaj Pulsar",
          "Bajaj Dominar",
          "Kawasaki W175",
          "Kawasaki Rouser",
          "Royal Enfield Hunter",
          "Royal Enfield Classic",
        ],
        Tricycle: [
          "Bajaj RE",
          "Kymco",
          "TVS King",
          "Mitsubishi",
          "Honda",
          "Suzuki",
          "Yamaha",
          "Piaggio",
          "Vespa",
          "Bajaj Maxima",
          "Bajaj Qute",
          "Lifan",
          "CPI",
          "Daihatsu",
          "Ape",
          "Kymco ATV",
          "TVS XL",
          "Rusi",
          "Mikasa",
          "Bajaj Boxer",
        ],
        Car: [
          "Toyota Vios",
          "Toyota Corolla",
          "Toyota Camry",
          "Toyota Yaris",
          "Honda City",
          "Honda Civic",
          "Honda Accord",
          "Honda Jazz",
          "Mitsubishi Mirage",
          "Mitsubishi Attrage",
          "Hyundai Eon",
          "Hyundai Accent",
          "Hyundai Elantra",
          "Ford Fiesta",
          "Ford Focus",
          "Nissan Almera",
          "Nissan Sylphy",
          "Suzuki Dzire",
          "Suzuki Swift",
          "Mazda 2",
          "Mazda 3",
          "Chevrolet Spark",
          "Chevrolet Aveo",
          "Kia Rio",
          "Kia Picanto",
          "Subaru Impreza",
          "Toyota Wigo",
        ],
        SUV: [
          "Toyota Fortuner",
          "Toyota Rush",
          "Toyota Corolla Cross",
          "Honda CR-V",
          "Honda HR-V",
          "Honda BR-V",
          "Mitsubishi Xpander",
          "Mitsubishi Montero",
          "Mitsubishi Outlander",
          "Hyundai Tucson",
          "Hyundai Santa Fe",
          "Ford Explorer",
          "Ford Escape",
          "Nissan X-Trail",
          "Nissan Terra",
          "Mazda CX-5",
          "Mazda CX-8",
          "Subaru Forester",
          "Subaru Outback",
          "Kia Sportage",
          "Kia Sorento",
          "Isuzu MU-X",
          "MG ZS",
          "Chery Tiggo",
          "Jeep Compass",
          "Toyota Innova",
        ],
        Van: [
          "Toyota Hiace",
          "Toyota Coaster",
          "Nissan Urvan",
          "Ford Transit",
          "Isuzu Traviz",
          "Mitsubishi Fuso Rosa",
          "Hyundai H-100",
          "Suzuki Carry",
          "Chevrolet Express",
          "Mercedes-Benz Sprinter",
          "Mercedes-Benz Vito",
          "Volkswagen Transporter",
          "Peugeot Expert",
          "Renault Master",
          "Kia K2500",
          "Isuzu N-Series",
          "Foton View",
          "Maxus V80",
        ],
        Pickup: [
          "Toyota Hilux",
          "Toyota Tacoma",
          "Mitsubishi Strada",
          "Mitsubishi L200",
          "Ford Ranger",
          "Ford F-150",
          "Isuzu D-Max",
          "Nissan Navara",
          "Nissan Frontier",
          "Mazda BT-50",
          "Chevrolet Colorado",
          "Chevrolet S10",
          "Honda Ridgeline",
          "Toyota Revo",
          "Isuzu MU-X",
          "Ford Ranger Raptor",
          "Ram 1500",
          "GMC Sierra",
          "Jeep Gladiator",
        ],
        Truck: [
          "Isuzu Elf",
          "Isuzu Giga",
          "Fuso Canter",
          "Fuso Fighter",
          "Hino 300",
          "Hino 500",
          "Mitsubishi Fuso",
          "Volvo FM",
          "Volvo FH",
          "Scania P-series",
          "Scania G-series",
          "MAN TGS",
          "MAN TGX",
          "Kenworth T680",
          "Freightliner Cascadia",
          "Peterbilt 579",
          "Mercedes-Benz Actros",
          "DAF XF",
          "Iveco Stralis",
        ],
      };

      // ── Role Selection ─────────────────────────────────────────
      function selectRole(role) {
        selectedRole = role;
        saveRegistrationDraft();
        document
          .getElementById("role-customer")
          .classList.toggle("selected", role === "customer");
        document
          .getElementById("role-rider")
          .classList.toggle("selected", role === "rider");
        // Next button color
        const btn = document.getElementById("btn-role-next");
        btn.className = "btn-next" + (role === "rider" ? " orange" : "");
        // Update step 1 subtitle
        document.getElementById("step1-sub").textContent =
          role === "rider"
            ? "Provide your personal info to start your rider application."
            : "Tell us a bit about yourself to create your account.";
        // Show/hide the rider-only driver's license number field
        const licenseGroup = document.getElementById("rider-license-group");
        if (licenseGroup) {
          licenseGroup.style.display = role === "rider" ? "" : "none";
          const licenseInput = document.getElementById("license_number");
          if (licenseInput) licenseInput.required = role === "rider";
        }
        // Show/hide rider-specific steps in sidebar preview
        updateBrandingSteps();
      }

      // ── Step Navigation ────────────────────────────────────────
      function goToStep(n) {
        currentStep = n;
        // Hide all panels
        document
          .querySelectorAll(".wizard-panel")
          .forEach((p) => p.classList.remove("active"));
        // If going to a rider-only step but role is customer, go to success
        if (selectedRole === "customer" && n >= 2) {
          showCustomerSuccess();
          return;
        }
        if (selectedRole === "rider" && n === 3) n = 4;
        if (n === 5) {
          if (selectedRole === "rider") showRiderSummary();
          else showCustomerSuccess();
          return;
        }
        const panel = document.getElementById("step-" + n);
        if (panel) panel.classList.add("active");
        updateStepIndicator(n);
        updateBrandingSteps();
        saveRegistrationDraft();
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function getRegistrationSummaryData() {
        const fullName =
          document.getElementById("full_name")?.value.trim() || "Not provided";
        const phone =
          document.getElementById("phone")?.value.trim() || "Not provided";
        const email =
          document.getElementById("email")?.value.trim() || "Not provided";
        const role = selectedRole === "rider" ? "Rider" : "Customer";
        const vehicleType = selectedVehicle || "Not selected";
        const vehicleModel =
          document.getElementById("vehicle_model")?.value.trim() ||
          "Not selected";
        const vehicleColor =
          document.getElementById("vehicle_color")?.value.trim() ||
          "Not provided";
        const vehiclePlate =
          document.getElementById("vehicle_plate")?.value.trim() ||
          "Not provided";
        const licenseNumber =
          document.getElementById("license_number")?.value.trim() ||
          "Not provided";
        const docs = [
          [
            "Driver's License",
            document.getElementById("license_file")?.files[0]?.name ||
              "Not uploaded",
          ],
          [
            "OR / CR Paper",
            document.getElementById("orcr_file")?.files[0]?.name ||
              "Not uploaded",
          ],
          [
            "Selfie",
            document.getElementById("selfie_file")?.files[0]?.name ||
              "Not uploaded",
          ],
          [
            "Vehicle Photo",
            document.getElementById("vehicle_file")?.files[0]?.name ||
              "Not uploaded",
          ],
          [
            "NBI Clearance",
            document.getElementById("nbi_file")?.files[0]?.name || "Optional",
          ],
        ];

        return {
          fullName,
          phone,
          email,
          role,
          vehicleType,
          vehicleModel,
          vehicleColor,
          vehiclePlate,
          licenseNumber,
          docs,
        };
      }

      function renderRegistrationSummary(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;

        const data = getRegistrationSummaryData();
        const rows = [
          ["Full Name", data.fullName],
          ["Phone", data.phone],
          ["Email", data.email],
          ["Account Type", data.role],
        ];

        if (selectedRole === "rider") {
          rows.push(["Driver's License Number", data.licenseNumber]);
          rows.push(["Vehicle Type", data.vehicleType]);
          rows.push(["Vehicle Model", data.vehicleModel]);
          rows.push(["Vehicle Color", data.vehicleColor]);
          rows.push(["Plate Number", data.vehiclePlate]);
        }

        const docsMarkup = data.docs
          .map(
            ([label, value]) =>
              `<div class="review-summary-item"><strong>${escapeHtml(label)}:</strong><span>${escapeHtml(value)}</span></div>`,
          )
          .join("");
        const rowsMarkup = rows
          .map(
            ([label, value]) =>
              `<div class="review-summary-item"><strong>${escapeHtml(label)}:</strong><span>${escapeHtml(value)}</span></div>`,
          )
          .join("");

        target.innerHTML = `
    <div class="review-summary-list">
      ${rowsMarkup}
      ${selectedRole === "rider" ? `<div class="review-summary-item"><strong>Uploaded Documents:</strong><span></span></div>${docsMarkup}` : ""}
    </div>
  `;
      }

      function showCustomerSuccess() {
        document
          .querySelectorAll(".wizard-panel")
          .forEach((p) => p.classList.remove("active"));
        document.getElementById("step-5-customer").classList.add("active");
        updateStepIndicator(99); // all done
        currentStep = 99;
        saveRegistrationDraft();
      }
      function wizardToIndicatorIndex(step) {
        if (selectedRole !== "rider") return step >= 99 ? 4 : Math.min(step, 1);
        if (step >= 99) return 4;
        if (step === 4) return 3;
        if (step === 5) return 4;
        return step;
      }

      function wizardToBrandingIndex(step) {
        if (step <= 2) return step;
        if (step === 4) return 3;
        if (step === 5 || step >= 99) return 4;
        return step;
      }

      function showRiderSummary() {
        document
          .querySelectorAll(".wizard-panel")
          .forEach((p) => p.classList.remove("active"));
        document.getElementById("step-5-rider").classList.add("active");
        updateStepIndicator(5);
        currentStep = 5;
        renderRegistrationSummary("rider-summary-content");
        saveRegistrationDraft();
      }
      function showRiderSuccess() {
        document
          .querySelectorAll(".wizard-panel")
          .forEach((p) => p.classList.remove("active"));
        document.getElementById("step-5-rider-success").classList.add("active");
        updateStepIndicator(99);
        currentStep = 99;
        saveRegistrationDraft();
      }

      // ── Step Indicator Updates ─────────────────────────────────
      function updateStepIndicator(active) {
        const stepItems = document.querySelectorAll(".step-item");
        const indicatorActive = wizardToIndicatorIndex(active);

        stepItems.forEach((item, i) => {
          item.classList.remove("active", "completed");
          const circle = item.querySelector(".step-circle");
          const num = circle.querySelector("span");
          const check = circle.querySelector("i");
          if (i < indicatorActive) {
            item.classList.add("completed");
            if (num) num.style.display = "none";
            if (check) check.style.display = "";
          } else if (i === indicatorActive) {
            item.classList.add("active");
            if (num) num.style.display = "";
            if (check) check.style.display = "none";
          } else {
            if (num) num.style.display = "";
            if (check) check.style.display = "none";
          }
        });

        const si2 = document.getElementById("si-2");
        const si3 = document.getElementById("si-3");
        const si4 = document.getElementById("si-4");
        if (selectedRole === "customer") {
          if (si2) si2.style.opacity = "0.3";
          if (si3) si3.style.opacity = "0.3";
          if (si4) si4.style.opacity = "0.3";
        } else {
          if (si2) si2.style.opacity = "";
          if (si3) si3.style.opacity = "";
          if (si4) si4.style.opacity = "";
        }
      }

      // ── Branding panel step dots ───────────────────────────────
      function updateBrandingSteps() {
        const isRider = selectedRole === "rider";
        const rp2 = document.getElementById("rider-step-2-preview");
        const rp3 = document.getElementById("rider-step-3-preview");
        const rp4 = document.getElementById("rider-step-4-preview");
        if (rp2) rp2.style.opacity = isRider ? "1" : "0.3";
        if (rp3) rp3.style.opacity = isRider ? "1" : "0.3";
        if (rp4) rp4.style.opacity = isRider ? "1" : "0.3";

        const brandingActive = wizardToBrandingIndex(currentStep);
        for (let i = 0; i <= 4; i++) {
          const dot = document.getElementById("bpd-" + i);
          if (!dot) continue;
          dot.className = "bp-step-dot";
          if (currentStep >= 99 || i < brandingActive)
            dot.classList.add("done");
          else if (i === brandingActive) dot.classList.add("active");
        }
      }

      function submitDocumentsStep() {
        goToStep(5);
      }

      // ── Vehicle Step Validation ────────────────────────────────
      function submitVehicleStep() {
        const plate = document.getElementById("vehicle_plate").value.trim();
        if (!plate) {
          if (typeof toast === "function")
            toast("Please enter your vehicle's plate number.", "error");
          else alert("Please enter your vehicle's plate number.");
          return;
        }
        if (!isValidPlateNumber(plate)) {
          if (typeof toast === "function")
            toast("Please enter a valid plate number (e.g. ABC 1234).", "error");
          else alert("Please enter a valid plate number (e.g. ABC 1234).");
          return;
        }
        goToStep(4);
      }

      // ── Personal Step Validation ───────────────────────────────
      function submitPersonalStep() {
        const name = document.getElementById("full_name").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const email = document.getElementById("email").value.trim();
        const pw = document.getElementById("password").value;
        const pw2 = document.getElementById("password2").value;
        const terms = document.getElementById("terms").checked;
        const licenseNumber = document
          .getElementById("license_number")
          .value.trim();

        if (!name || !phone || !email || !pw) {
          if (typeof toast === "function")
            toast("Please fill in all required fields.", "error");
          else alert("Please fill in all required fields.");
          return;
        }
        if (!isValidPhoneMobile(phone)) {
          if (typeof toast === "function")
            toast(
              "Please enter a valid mobile number (09XX XXX XXXX).",
              "error",
            );
          else alert("Please enter a valid mobile number (09XX XXX XXXX).");
          return;
        }
        if (selectedRole === "rider" && !isValidLicenseNumber(licenseNumber)) {
          if (typeof toast === "function")
            toast(
              "Please enter a valid driver's license number (e.g. N12-34-567890).",
              "error",
            );
          else
            alert(
              "Please enter a valid driver's license number (e.g. N12-34-567890).",
            );
          return;
        }
        if (pw !== pw2) {
          if (typeof toast === "function")
            toast("Passwords do not match.", "error");
          else alert("Passwords do not match.");
          return;
        }
        if (!terms) {
          if (typeof toast === "function")
            toast("Please accept the Terms & Privacy Policy.", "error");
          else alert("Please accept the Terms & Privacy Policy.");
          return;
        }

        if (selectedRole === "rider") {
          goToStep(2);
        } else {
          // Customer — submit and show success
          submitCustomerRegistration();
        }
      }

      let __customerSubmitting = false;
      async function submitCustomerRegistration() {
        if (__customerSubmitting) return;
        __customerSubmitting = true;

        const btn = document.getElementById("btn-personal-next");
        const originalBtnHtml = btn ? btn.innerHTML : null;

        if (btn) {
          btn.disabled = true;
          btn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
        }

        try {
          if (typeof supabase === "undefined") {
            throw new Error("Supabase client is not available.");
          }

          // Validate required fields (beyond HTML5)
          const email = document.getElementById("email").value.trim();
          const password = document.getElementById("password").value;
          const full_name = document.getElementById("full_name").value.trim();
          const phone = normalizePhoneMobile(
            document.getElementById("phone").value,
          );

          if (!email || !password || !full_name || !phone) {
            throw new Error("Please fill in all required fields.");
          }
          if (!isValidPhoneMobile(phone)) {
            throw new Error(
              "Please enter a valid mobile number (09XX XXX XXXX).",
            );
          }

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name, role: "customer" } },
          });

          if (error) throw error;

          if (data?.user?.id) {
            await supabase
              .from("profiles")
              .update({ phone })
              .eq("id", data.user.id);
          }

          clearFormDraft(REGISTER_DRAFT_KEY);

          // Customer should land on customer STEP 5 success panel
          showCustomerSuccess();
          document.getElementById("step-5-customer")?.classList.add("active");
          document
            .getElementById("step-5-rider-success")
            ?.classList.remove("active");
          document.getElementById("step-5-rider")?.classList.remove("active");

          const customerTitle = document.querySelector(
            "#step-5-customer .success-title",
          );
          const customerMsg = document.querySelector(
            "#step-5-customer .success-message",
          );
          if (customerTitle)
            customerTitle.textContent = "Account created successfully";
          if (customerMsg) customerMsg.textContent = "Please log in.";

          setTimeout(() => {
            window.location.href = "login.html";
          }, 700);
        } catch (err) {
          const msg = err?.message || String(err);
          if (typeof toast === "function") toast(msg, "error");
          else alert(msg);
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML =
              originalBtnHtml ||
              'Continue <i class="fa-solid fa-arrow-right"></i>';
          }
          __customerSubmitting = false;
        }
      }

      let __riderSubmitting = false;
      async function submitRiderRegistration() {
        if (__riderSubmitting) return;
        __riderSubmitting = true;

        const btn = document.getElementById("btn-submit-rider");
        const originalBtnHtml = btn ? btn.innerHTML : null;

        if (btn) {
          btn.disabled = true;
          btn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
        }

        try {
          if (typeof supabase === "undefined") {
            throw new Error("Supabase client is not available.");
          }

          const email = document.getElementById("email").value.trim();
          const password = document.getElementById("password").value;
          const full_name = document.getElementById("full_name").value.trim();
          const phone = normalizePhoneMobile(
            document.getElementById("phone").value,
          );
          const licenseNumberRaw =
            document.getElementById("license_number")?.value || "";
          const vehiclePlateRaw =
            document.getElementById("vehicle_plate")?.value || "";

          if (!email || !password || !full_name || !phone) {
            throw new Error("Please fill in all required fields.");
          }
          if (!isValidPhoneMobile(phone)) {
            throw new Error(
              "Please enter a valid mobile number (09XX XXX XXXX).",
            );
          }
          if (!isValidLicenseNumber(licenseNumberRaw)) {
            throw new Error(
              "Please enter a valid driver's license number (e.g. N12-34-567890).",
            );
          }
          if (!isValidPlateNumber(vehiclePlateRaw)) {
            throw new Error(
              "Please enter a valid plate number (e.g. ABC 1234).",
            );
          }

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name, role: "rider" } },
          });
          if (error) throw error;

          const userId = data?.user?.id;

          if (userId) {
            await supabase.from("profiles").update({ phone }).eq("id", userId);

            const licenseFile =
              document.getElementById("license_file").files[0];
            const orcrFile = document.getElementById("orcr_file").files[0];
            const selfieFile = document.getElementById("selfie_file").files[0];
            const vehicleFile =
              document.getElementById("vehicle_file").files[0];
            const nbiFile = document.getElementById("nbi_file").files[0];

            let license_url = null,
              or_cr_url = null,
              selfie_url = null,
              vehicle_url = null,
              nbi_url = null;

            // Upload docs; if any fail, still submit rider_application (pending)
            try {
              if (licenseFile)
                license_url = await uploadRiderDoc(
                  userId,
                  licenseFile,
                  "license",
                );
              if (orcrFile)
                or_cr_url = await uploadRiderDoc(userId, orcrFile, "orcr");
              if (selfieFile)
                selfie_url = await uploadRiderDoc(userId, selfieFile, "selfie");
              if (vehicleFile)
                vehicle_url = await uploadRiderDoc(
                  userId,
                  vehicleFile,
                  "vehicle",
                );
              if (nbiFile)
                nbi_url = await uploadRiderDoc(userId, nbiFile, "nbi");
            } catch (_) {}

            const vehicle_model =
              document.getElementById("vehicle_model")?.value?.trim() || null;
            const license_number = normalizeLicenseNumber(licenseNumberRaw) || null;
            const vehicle_plate = normalizePlateNumber(vehiclePlateRaw) || null;

            const { error: appError } = await supabase
              .from("rider_applications")
              .insert({
                rider_id: userId,
                vehicle_type: selectedVehicle || "Motorcycle",
                vehicle_model,
                license_number,
                vehicle_plate,
                license_url,
                or_cr_url,
                selfie_url,
                vehicle_url,
                nbi_url,
                status: "pending",
              });

            if (appError) {
              console.error("Rider application insert failed:", appError);
              // Store minimal data in localStorage so the dashboard can retry the insert on first login
              try {
                localStorage.setItem(
                  "itulod_pending_app_" + userId,
                  JSON.stringify({
                    vehicle_type: selectedVehicle || "Motorcycle",
                    vehicle_model,
                    license_number,
                    vehicle_plate,
                    license_url,
                    or_cr_url,
                    selfie_url,
                    vehicle_url,
                    nbi_url,
                  }),
                );
              } catch (_) {}
            }
          }

          clearFormDraft(REGISTER_DRAFT_KEY);

          // Ensure rider SUCCESS panel is the only visible Step 5 panel
          showRiderSuccess();
          document
            .getElementById("step-5-rider-success")
            ?.classList.add("active");
          document
            .getElementById("step-5-customer")
            ?.classList.remove("active");
          document.getElementById("step-5-rider")?.classList.remove("active");

          const riderTitle = document.querySelector(
            "#step-5-rider-success .success-title",
          );
          const riderMsg = document.querySelector(
            "#step-5-rider-success .success-message",
          );
          if (riderTitle)
            riderTitle.textContent = "Account created successfully";
          if (riderMsg) riderMsg.textContent = "Please log in.";

          // Riders should remain visible on the Step 5 pending-approval screen
          // so they clearly know their account isn't approved yet.
        } catch (err) {
          const msg = err?.message || String(err);
          if (typeof toast === "function") toast(msg, "error");
          else alert(msg);
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML =
              originalBtnHtml ||
              'Submit Application <i class="fa-solid fa-paper-plane"></i>';
          }
          __riderSubmitting = false;
        }
      }

      // ── Vehicle Selection ──────────────────────────────────────
      function updateVehicleModelOptions() {
        const modelSelect = document.getElementById("vehicle_model");
        if (!modelSelect) return;

        const availableModels = vehicleModelsByType[selectedVehicle] || [];
        const preservedValue = modelSelect.value;

        modelSelect.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select vehicle model";
        modelSelect.appendChild(placeholder);

        availableModels.forEach((model) => {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });

        if (availableModels.includes(preservedValue)) {
          modelSelect.value = preservedValue;
        } else if (availableModels.length) {
          modelSelect.value = availableModels[0];
        } else {
          modelSelect.value = "";
        }
      }

      function syncVehicleSelectionUI() {
        document.querySelectorAll(".vehicle-card").forEach((card) => {
          card.classList.toggle(
            "selected",
            card.dataset.vehicle === selectedVehicle,
          );
        });
        updateVehicleModelOptions();
      }

      function selectVehicle(el, name) {
        selectedVehicle = name;
        syncVehicleSelectionUI();
        saveRegistrationDraft();
      }

      // ── Password Strength ──────────────────────────────────────
      function updateStrength(pw) {
        const bar = document.getElementById("pw-strength");
        if (!bar) return;
        bar.style.display = pw.length ? "block" : "none";
        const segs = [1, 2, 3, 4].map((i) =>
          document.getElementById("ps-" + i),
        );
        const label = document.getElementById("ps-label");
        let score = 0;
        if (pw.length >= 6) score++;
        if (pw.length >= 10) score++;
        if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
        if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

        const levels = ["", "weak", "fair", "good", "strong"];
        const labels = ["", "Weak", "Fair", "Good", "Strong"];
        segs.forEach((s, i) => {
          s.className =
            "pw-strength-seg" + (i < score ? " " + levels[score] : "");
        });
        if (label) {
          label.className = "pw-strength-label " + (levels[score] || "");
          label.textContent = labels[score] || "";
        }
      }

      // ── Password Toggle ────────────────────────────────────────
      function togglePw(id, btn) {
        const input = document.getElementById(id);
        const icon = btn.querySelector("i");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        icon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      }

      // ── File Upload Handling ───────────────────────────────────
      function triggerFileInput(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
          input.value = "";
          input.click();
        }
      }

      function handleFileSelect(input, zoneId, previewId) {
        const file = input.files[0];
        if (!file) return;
        const zone = document.getElementById(zoneId);
        const prev = document.getElementById(previewId);
        zone.classList.add("has-file");
        const icon = zone.querySelector(".upload-icon i");
        if (file.type.startsWith("image/") && prev) {
          const reader = new FileReader();
          reader.onload = (e) => {
            prev.src = e.target.result;
          };
          reader.readAsDataURL(file);
          if (icon) icon.className = "fa-solid fa-image";
        } else {
          if (icon) icon.className = "fa-solid fa-file-pdf";
        }
        const label = zone.querySelector(".upload-hint");
        if (label)
          label.textContent =
            file.name.length > 24 ? `${file.name.slice(0, 21)}…` : file.name;
      }

      function handleDragOver(e, zone) {
        e.preventDefault();
        zone.classList.add("dragging");
      }
      function handleDragLeave(zone) {
        zone.classList.remove("dragging");
      }
      function handleDrop(e, zone, inputId) {
        e.preventDefault();
        zone.classList.remove("dragging");
        const input = document.getElementById(inputId);
        const file = e.dataTransfer.files[0];
        if (!file || !input) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change"));
      }

      function saveRegistrationDraft() {
        const form = document.querySelector(".form-panel");
        saveFormDraft(REGISTER_DRAFT_KEY, form, {
          currentStep,
          selectedRole,
          selectedVehicle,
        });
      }

      function restoreRegistrationDraft() {
        const form = document.querySelector(".form-panel");
        const draft = restoreFormDraft(REGISTER_DRAFT_KEY, form, {
          currentStep: 0,
          selectedRole: "customer",
          selectedVehicle: "Motorcycle",
        });
        if (!draft) return;

        if (draft.currentStep !== undefined)
          currentStep = Number(draft.currentStep) || 0;
        if (currentStep === 3) currentStep = 4;
        if (draft.selectedRole) selectedRole = draft.selectedRole;
        if (draft.selectedVehicle) selectedVehicle = draft.selectedVehicle;

        syncVehicleSelectionUI();

        const roleInput = document.querySelector(
          `input[name="role"][value="${selectedRole}"]`,
        );
        if (roleInput) roleInput.checked = true;

        if (draft.currentStep >= 99) {
          showRiderSuccess();
          return;
        }

        selectRole(selectedRole);
        if (currentStep > 0) {
          goToStep(currentStep);
        } else {
          goToStep(0);
        }
      }

      // ── Init ───────────────────────────────────────────────────
      (function init() {
        // Philippine field masks (shared helpers from js/utils.js)
        attachInputMask(document.getElementById("phone"), formatPhoneMobile);
        attachInputMask(
          document.getElementById("vehicle_plate"),
          formatPlateNumber,
        );
        attachInputMask(
          document.getElementById("license_number"),
          formatLicenseNumber,
        );

        // Full name mask
        const nameInput = document.getElementById("full_name");
        if (nameInput && typeof IMask !== "undefined") {
          IMask(nameInput, { mask: /^[a-zA-ZÀ-ÖØ-öø-ÿ .'"-]{0,60}$/ });
        }

        document.addEventListener("input", saveRegistrationDraft, true);
        document.addEventListener("change", saveRegistrationDraft, true);

        // Fresh start: when arriving at register.html (no query params),
        // clear any persisted wizard state so users never land on the last step/pending UI.
        const hasExplicitRole = new URLSearchParams(window.location.search).has(
          "role",
        );
        if (!hasExplicitRole) {
          try {
            localStorage.removeItem(REGISTER_DRAFT_KEY);
          } catch (_) {}
        }

        const urlRole = new URLSearchParams(window.location.search).get("role");
        if (urlRole === "rider") {
          selectedRole = "rider";
        }

        restoreRegistrationDraft();

        // A restored draft sets values directly (no input event), so re-run the
        // masks once so an in-progress phone / plate / licence shows formatted.
        [
          ["phone", formatPhoneMobile],
          ["vehicle_plate", formatPlateNumber],
          ["license_number", formatLicenseNumber],
        ].forEach(([id, fmt]) => {
          const el = document.getElementById(id);
          if (el && el.value) el.value = fmt(el.value);
        });
      })();
