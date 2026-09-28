# Scientific References

1. Bozkurt S. Mathematical modeling of cardiac function to evaluate clinical cases in adults and children. **PLoS ONE.** 2019;14(10):e0224663. DOI: 10.1371/journal.pone.0224663.
   - Used for the adult dilated-cardiomyopathy/HFrEF baseline concept and reported EDV/EF values.

2. Ishizaka S, Asanoi H, Kameyama T, Sasayama S. Effect of dobutamine on ventriculo-arterial coupling and ventricular work efficiency in patients with cardiac failure. **J Cardiol.** 1988;18(2):457–465. PMID: 3249270.
   - In nine patients with cardiac dysfunction, dobutamine 5 µg/kg/min decreased EDV by 4%, increased Ees by 41%, and decreased Ea by 23%.

3. Kates RE, Leier CV. Dobutamine pharmacokinetics in severe heart failure. **Clin Pharmacol Ther.** 1978;24(5):537–541. PMID: 699477.
   - Human severe-heart-failure PK: elimination half-life 2.37 ± 0.7 min and distribution volume 0.202 ± 0.084 L/kg.

## Modeling assumptions introduced by this project

The following values/relationships are not direct clinical prescriptions and are explicitly simulation assumptions:

- 3-second first-order infusion-pump actuator time constant.
- Linear interpolation of the reported 5 µg/kg/min hemodynamic changes from zero to reference exposure.
- Fixed HR = 75 bpm for the bounded control experiment.
- Simplified BP/MAP display approximation.
- Procedural 3D deformation.

This repository is for educational control-system simulation only.
